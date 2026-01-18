# PostgreSQL pg_trgm Extension Setup

## Giới thiệu

Extension `pg_trgm` (Trigram) của PostgreSQL được sử dụng để tìm kiếm fuzzy search - tìm kiếm có khả năng chấp nhận lỗi chính tả và typo.

## Cài đặt

### 1. Kết nối vào PostgreSQL

```bash
psql -U postgres -d your_database_name
```

### 2. Enable Extension pg_trgm

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3. Kiểm tra Extension đã được cài đặt

```sql
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

### 4. Tạo Index cho Fuzzy Search (Tùy chọn, để tăng hiệu suất)

```sql
-- Tạo GIN index cho các trường thường xuyên tìm kiếm
CREATE INDEX IF NOT EXISTS idx_email_raw_subject_trgm ON email_raw USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_email_raw_from_name_trgm ON email_raw USING gin (from_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_email_raw_from_trgm ON email_raw USING gin ("from" gin_trgm_ops);

```

## Sử dụng

### API Endpoint

```
GET /gmail/search/fuzzy?q=search_query&limit=50
```

### Ví dụ:

```bash
curl -X GET "http://localhost:3000/gmail/search/fuzzy?q=importnt%20meating" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Sẽ tìm ra các email có từ "important meeting" mặc dù query có typo.

## Cách hoạt động

`pg_trgm` sử dụng thuật toán Trigram để so sánh độ tương đồng giữa các chuỗi:

1. **Trigram**: Chia chuỗi thành các cụm 3 ký tự liên tiếp
   - Ví dụ: "hello" → ["  h", " he", "hel", "ell", "llo", "lo "]

2. **Similarity Score**: Tính toán dựa trên số lượng trigram chung giữa 2 chuỗi
   - `similarity(string1, string2)` trả về giá trị từ 0 đến 1
   - Giá trị càng cao = càng giống nhau

3. **Fuzzy Search trong Backend**:
   - Tìm kiếm trong: subject, fromName, from, bodyText
   - Ngưỡng similarity: 0.1 cho subject/fromName/from, 0.05 cho bodyText
   - Sắp xếp theo điểm tương đồng cao nhất

## So sánh với Semantic Search

| Feature | Fuzzy Search (pg_trgm) | Semantic Search (Qdrant) |
|---------|------------------------|--------------------------|
| **Mục đích** | Tìm lỗi chính tả, typo | Tìm ý nghĩa tương tự |
| **Ví dụ Query** | "importnt meating" | "urgent task deadline" |
| **Kết quả** | "important meeting" | "critical assignment due date" |
| **Performance** | Nhanh hơn | Chậm hơn (cần AI embedding) |
| **Chính xác** | Dựa trên chuỗi | Dựa trên ngữ nghĩa |
| **Use Case** | Lỗi gõ phím | Tìm ý nghĩa gần |

## Troubleshooting

### Lỗi: extension "pg_trgm" does not exist

```sql
-- Kiểm tra available extensions
SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';

-- Nếu không có, cài đặt PostgreSQL contrib package
-- Ubuntu/Debian:
sudo apt-get install postgresql-contrib

-- CentOS/RHEL:
sudo yum install postgresql-contrib

-- Sau đó enable lại:
CREATE EXTENSION pg_trgm;
```

### Performance chậm

1. Đảm bảo đã tạo GIN index (xem bước 4 ở trên)
2. Tăng threshold similarity nếu kết quả quá nhiều
3. Giới hạn số kết quả trả về (limit parameter)

## References

- [PostgreSQL pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html)
- [Fuzzy String Matching in PostgreSQL](https://www.postgresql.org/docs/current/pgtrgm.html#PGTRGM-SIMILARITY)
