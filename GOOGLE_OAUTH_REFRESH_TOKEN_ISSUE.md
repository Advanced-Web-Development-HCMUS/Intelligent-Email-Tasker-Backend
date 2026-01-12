# 🔍 Google OAuth Refresh Token Issue - Root Cause Analysis

## 📋 Tóm Tắt Vấn Đề

**Hiện tượng:**
- ✅ Flow "Connect Gmail" (`/gmail/auth`) → Nhận được `refresh_token` từ Google
- ❌ Flow "Sign In with Google" (`/auth/google`) → KHÔNG nhận được `refresh_token` từ Google

**Impact:**
- User sign in thành công
- User được tạo trong database  
- JWT tokens được tạo
- NHƯNG: Gmail tokens KHÔNG được lưu → Không thể sync emails

---

## 🎯 NGUYÊN NHÂN GỐC RỄ

### Google OAuth Refresh Token Policy

Google **CHỈ TRẢ `refresh_token` MỘT LẦN DUY NHẤT** cho mỗi combination của:
- Client ID
- User account
- **Redirect URI** ← KEY DIFFERENCE
- Scopes

### Khi nào Google TRẢ refresh_token?

✅ **Lần đầu tiên** user authorize app với redirect URI cụ thể
✅ **Sau khi revoke** và authorization HOÀN TOÀN MỚI (bao gồm redirect URI khác)

❌ **KHÔNG TRẢ** khi:
- User đã authorize trước đó (dù có `prompt: 'consent'`)
- Token cũ vẫn còn trong Google's internal storage
- Revoke từ UI (`myaccount.google.com/permissions`) không xóa hết token cũ

---

## 🔍 Tại Sao Gmail Flow Hoạt Động?

### Flow Comparison

| Aspect | Auth Flow (❌ FAIL) | Gmail Flow (✅ SUCCESS) |
|--------|---------------------|-------------------------|
| **Endpoint** | `/auth/google` | `/gmail/auth` |
| **Callback URL** | `http://localhost:3001/auth/oauth/callback` | `http://localhost:3001/gmail/callback` |
| **Google View** | Same authorization as before | **DIFFERENT authorization** (new redirect URI) |
| **Refresh Token** | Not returned (already issued) | ✅ **Returned** (first time for this URI) |

### Explanation

Gmail flow hoạt động vì:
1. Sử dụng **khác redirect URI** (`/gmail/callback` vs `/auth/oauth/callback`)
2. Google treats this as a **completely new authorization grant**
3. → Trả `refresh_token` vì đây là lần đầu với URI này

---

## 🔧 CÁC GIẢI PHÁP

### ✅ Solution 1: Prompt User to Revoke Access (Quick Fix)

**Cách làm:**
```markdown
1. User gặp lỗi "No Gmail access"
2. App hiển thị message:
   "To enable Gmail sync, please:
   1. Visit https://myaccount.google.com/permissions
   2. Remove 'Intelligent Email Tasker' access
   3. Click 'Sign In with Google' again"
```

**Pros:**
- Không cần code changes
- Works immediately

**Cons:**
- Poor UX (user phải manual revoke)
- Không giải quyết căn bản

---

### ✅ Solution 2: Programmatic Token Revocation (RECOMMENDED)

**Implementation:**

#### Step 1: Detect Missing Refresh Token

Trong `google.strategy.ts`, check nếu không có refresh token:

```typescript
async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
  try {
    // ... existing code ...

    if (!refreshToken) {
      // ⚠️ CRITICAL: No refresh token received
      // This means user has already authorized before
      
      console.warn(`⚠️ No refresh token for ${email}. Need to revoke existing grant.`);
      
      // OPTION A: Throw error with instruction
      return done(
        new Error(
          'REFRESH_TOKEN_REQUIRED|' +
          'To enable Gmail sync, revoke app access at ' +
          'https://myaccount.google.com/permissions and try again'
        ),
        null
      );
      
      // OPTION B: Auto-revoke using access token (if available)
      // See Step 2 below
    }
    
    // ... rest of validation ...
  }
}
```

#### Step 2: Auto-Revoke Previous Grant (Advanced)

Create a utility function:

```typescript
// src/auth/utils/google-token-revoke.util.ts
import axios from 'axios';

export async function revokeGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.post(
      'https://oauth2.googleapis.com/revoke',
      null,
      {
        params: { token: accessToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return response.status === 200;
  } catch (error) {
    console.error('Failed to revoke Google token:', error);
    return false;
  }
}
```

Use in strategy:

```typescript
async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
  if (!refreshToken) {
    // Try to revoke current grant
    const revoked = await revokeGoogleToken(accessToken);
    
    if (revoked) {
      return done(
        new Error('AUTHORIZATION_REVOKED|Please sign in again to grant Gmail access'),
        null
      );
    }
  }
  // ... rest of code ...
}
```

#### Step 3: Handle Error in Controller

```typescript
// auth.controller.ts
@Get('oauth/callback')
@UseGuards(GoogleOAuthGuard)
async googleAuthCallback(@Req() req: any, @Res() res: ExpressResponse) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  
  try {
    const user = req.user;
    
    if (!user) {
      // Check if error is about refresh token
      const error = req.authInfo?.message || '';
      
      if (error.startsWith('REFRESH_TOKEN_REQUIRED')) {
        return res.redirect(
          `${frontendUrl}/login?error=refresh_token_required&` +
          `message=${encodeURIComponent('Please revoke app access and try again')}`
        );
      }
      
      if (error.startsWith('AUTHORIZATION_REVOKED')) {
        return res.redirect(
          `${frontendUrl}/login?error=auth_revoked&` +
          `message=${encodeURIComponent('Please sign in again')}`
        );
      }
      
      // ... other error handling ...
    }
    
    // ... success flow ...
  } catch (error) {
    // ... error handling ...
  }
}
```

**Pros:**
- Automatic handling
- Better UX
- Clear error messages

**Cons:**
- Requires code changes
- User still needs to sign in twice (first: revoke, second: get new token)

---

### ✅ Solution 3: Unified OAuth Flow (BEST PRACTICE)

**Idea:** Merge auth và gmail flows thành một flow duy nhất

#### Step 1: Remove Separate Auth Flow

Remove Passport GoogleStrategy entirely, use manual OAuth like Gmail flow

#### Step 2: Update Auth Controller

```typescript
// auth.controller.ts
@Get('google')
@ApiOperation({ summary: 'Sign in with Google' })
async googleAuth(@Res() res: Response): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    this.configService.get('GOOGLE_CLIENT_ID'),
    this.configService.get('GOOGLE_CLIENT_SECRET'),
    'http://localhost:3001/auth/google/callback'  // ← Same as Gmail flow pattern
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    prompt: 'consent',  // Force consent every time
  });

  res.redirect(authUrl);
}

@Get('google/callback')
async googleAuthCallback(
  @Query('code') code: string,
  @Res() res: Response
): Promise<void> {
  const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
  
  try {
    // Exchange code for tokens (SAME AS GMAIL FLOW)
    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      'http://localhost:3001/auth/google/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    // ✅ tokens.refresh_token will be present!
    console.log('Refresh token:', tokens.refresh_token);
    
    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    
    // Create/update user
    const user = await this.authService.findOrCreateGoogleUser({
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
    });
    
    // Save Gmail tokens
    await this.authService.saveGmailTokens(
      user.id,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
    );
    
    // Generate JWT tokens
    const authTokens = await this.authService.generateTokens(user);
    
    // Redirect to frontend with access token
    res.redirect(
      `${frontendUrl}/auth/callback?` +
      `access_token=${authTokens.accessToken}&` +
      `user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name
      }))}`
    );
    
  } catch (error) {
    console.error('Google auth callback error:', error);
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
}
```

**Pros:**
- ✅ Always gets refresh_token
- ✅ Consistent flow cho cả auth và gmail sync
- ✅ No Passport complexity
- ✅ Easy to debug

**Cons:**
- Requires rewriting auth flow
- Need to update frontend callback URL

---

### ✅ Solution 4: Use Different Scope Strategy

**Idea:** Request minimal scopes initially, then incrementally add Gmail scopes

#### Initial Auth (Sign In)
```typescript
scopes: ['email', 'profile']  // ← No Gmail scopes
```

#### Later (Connect Gmail)
```typescript
scopes: [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
]  // ← Now include Gmail scopes
```

**Google will treat expanded scopes as NEW authorization** → Returns refresh_token!

**Implementation:**

Keep current Passport flow with minimal scopes:
```typescript
// google.strategy.ts
super({
  // ... config ...
  scope: ['email', 'profile'],  // ← Remove Gmail scopes
  accessType: 'offline',
  prompt: 'consent',
});
```

Keep Gmail flow as-is (with Gmail scopes) ← This becomes the "upgrade" flow

**Pros:**
- ✅ Simple fix
- ✅ Gradual permission request (better UX)
- ✅ Refresh token on Gmail connect

**Cons:**
- User must do 2-step auth (sign in → connect Gmail)

---

## 📊 Recommendation Matrix

| Solution | Complexity | UX | Reliability | Recommendation |
|----------|-----------|----|-----------| ---------------|
| **1. Manual Revoke** | 🟢 Low | 🔴 Poor | 🟡 Medium | ❌ Not recommended |
| **2. Auto-Revoke** | 🟡 Medium | 🟡 OK | 🟡 Medium | ⚠️ Temporary fix |
| **3. Unified Flow** | 🔴 High | 🟢 Best | 🟢 High | ✅ **BEST** long-term |
| **4. Incremental Scopes** | 🟢 Low | 🟢 Good | 🟢 High | ✅ **RECOMMENDED** |

---

## 🚀 KHUYẾN NGHỊ CUỐI CÙNG

### Immediate Fix (Today):
**Implement Solution 4: Incremental Scopes**

1. Remove Gmail scopes from `google.strategy.ts`:
   ```typescript
   scope: ['email', 'profile']  // Only basic scopes
   ```

2. Keep Gmail flow unchanged (already works!)

3. Update frontend flow:
   - User signs in with Google → Gets account created
   - User clicks "Connect Gmail" → Goes to `/gmail/auth` → Gets refresh_token ✅

### Long-term Improvement:
**Implement Solution 3: Unified Flow**
- Replace Passport with manual OAuth2 (like Gmail flow)
- Single, consistent authorization flow
- Always gets refresh_token
- Easier to maintain and debug

---

## 📝 Tài Liệu Tham Khảo

1. **Google OAuth 2.0 Documentation:**
   - https://developers.google.com/identity/protocols/oauth2/web-server#offline

2. **Refresh Token Handling:**
   - https://developers.google.com/identity/protocols/oauth2#expiration

3. **Token Revocation:**
   - https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke

---

## 🎓 Key Learnings

1. **Google only issues refresh_token ONCE per unique combination of:**
   - Client ID
   - User
   - Redirect URI
   - Scopes

2. **`prompt: 'consent'` forces consent screen but NOT new refresh_token**

3. **Different redirect URIs = Different authorizations** (why Gmail flow works)

4. **Manual OAuth2 (googleapis) > Passport for Google OAuth** (more control, clearer debugging)

5. **Incremental authorization is better UX** (ask for permissions when needed)

---

**Created:** January 6, 2026  
**Author:** GitHub Copilot  
**Status:** Root cause identified, solutions provided
