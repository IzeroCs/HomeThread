# Setup Guide - Monorepo với npm workspaces

## 🔍 Cách npm workspaces hoạt động

npm workspaces sẽ tự động:
1. Tìm tất cả các thư mục được khai báo trong `workspaces` array
2. Kiểm tra xem mỗi thư mục có `package.json` không
3. Install dependencies cho các workspace có `package.json`
4. Hoist dependencies chung lên `node_modules` ở root (nếu có thể)
5. Link các workspace với nhau

## ⚠️ Vấn đề hiện tại

Frontend chưa có `package.json`, nên npm workspaces không thể install dependencies cho nó.

## ✅ Giải pháp

### Option 1: Tạo frontend project với Vite (Khuyến nghị)

```bash
cd frontend
npm create vite@latest . -- --template react-ts
cd ..
npm install  # Chạy lại từ root để link workspaces
```

### Option 2: Tạo package.json thủ công

Tạo `frontend/package.json` với nội dung cơ bản, sau đó chạy `npm install` từ root.

## 📝 Các bước setup đầy đủ

1. **Backend đã có package.json** ✅
2. **Frontend cần tạo package.json**:
   ```bash
   cd frontend
   npm create vite@latest . -- --template react-ts
   ```
3. **Install từ root**:
   ```bash
   cd ..  # Về root
   npm install
   ```

## 🔧 Verify workspaces hoạt động

Sau khi install, kiểm tra:

```bash
# Xem các workspaces được nhận diện
npm ls --workspaces

# Xem dependencies của một workspace
npm ls --workspace=backend
npm ls --workspace=frontend
```

## 💡 Lưu ý

- Mỗi workspace phải có `package.json` riêng
- `name` trong package.json của mỗi workspace nên unique (ví dụ: `@dashboard-thread/backend`, `@dashboard-thread/frontend`)
- Dependencies được hoist lên root `node_modules` khi có thể
- Có thể reference workspace khác trong dependencies: `"@dashboard-thread/backend": "workspace:*"`
