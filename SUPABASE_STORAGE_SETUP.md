# Supabase Storage 설정 가이드

리뷰 이미지 및 지도 스크린샷 저장을 위한 Supabase Storage 설정 방법입니다.

## 📋 설정 체크리스트

설정 완료 후 브라우저 콘솔에서 다음 명령어로 확인할 수 있습니다:
```javascript
await window.checkSupabaseSetup()
```

## 1. Storage 버킷 생성

### Supabase 대시보드 접속
1. [Supabase Dashboard](https://app.supabase.com)에 로그인
2. 프로젝트 선택
3. 좌측 메뉴에서 **Storage** 클릭

### 버킷 1: `review-images` 생성
1. **"New bucket"** 또는 **"Create bucket"** 버튼 클릭
2. 다음 정보 입력:
   - **Name**: `review-images`
   - **Public bucket**: ✅ 체크 (공개 버킷)
   - **File size limit**: `5` MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp` (선택사항)
3. **"Create bucket"** 클릭

### 버킷 2: `route-maps` 생성
1. **"New bucket"** 또는 **"Create bucket"** 버튼 클릭
2. 다음 정보 입력:
   - **Name**: `route-maps`
   - **Public bucket**: ✅ 체크 (공개 버킷)
   - **File size limit**: `2` MB
   - **Allowed MIME types**: `image/png` (선택사항)
3. **"Create bucket"** 클릭

## 2. Storage Policies (RLS) 설정

### Supabase SQL Editor 접속
1. 좌측 메뉴에서 **SQL Editor** 클릭
2. **"New query"** 클릭

### RLS 정책 SQL 실행
다음 SQL을 복사하여 실행하세요:

```sql
-- review-images bucket: 모든 사용자가 읽기 가능, 인증된 사용자만 업로드 가능
CREATE POLICY "Public read access for review-images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'review-images');

CREATE POLICY "Authenticated users can upload review-images" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'review-images' 
  AND auth.role() = 'authenticated'
);

-- route-maps bucket: 모든 사용자가 읽기 가능, 인증된 사용자만 업로드 가능
CREATE POLICY "Public read access for route-maps" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'route-maps');

CREATE POLICY "Authenticated users can upload route-maps" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'route-maps' 
  AND auth.role() = 'authenticated'
);
```

**참고**: 정책이 이미 존재하는 경우 오류가 발생할 수 있습니다. 이는 정상이며 무시해도 됩니다.

## 3. 데이터베이스 스키마 확장

### SQL Editor에서 스키마 확장 SQL 실행
1. **SQL Editor**에서 **"New query"** 클릭
2. `supabase-schema-extension.sql` 파일의 내용을 복사하여 붙여넣기
3. **"Run"** 버튼 클릭

또는 직접 다음 SQL을 실행하세요:

```sql
-- trip_reviews 테이블에 컬럼 추가
ALTER TABLE trip_reviews 
ADD COLUMN IF NOT EXISTS overall_review_image_url TEXT,
ADD COLUMN IF NOT EXISTS route_map_image_url TEXT;

-- place_reviews 테이블에 컬럼 추가
ALTER TABLE place_reviews 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 인덱스 추가 (선택사항, 성능 향상을 위해)
CREATE INDEX IF NOT EXISTS idx_trip_reviews_route_map_image 
ON trip_reviews(route_map_image_url) 
WHERE route_map_image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_place_reviews_image_url 
ON place_reviews(image_url) 
WHERE image_url IS NOT NULL;
```

## 4. 설정 확인

### 브라우저 콘솔에서 확인
1. 개발자 도구 열기 (F12)
2. Console 탭에서 다음 명령어 실행:

```javascript
// 설정 확인
const results = await window.checkSupabaseSetup();
console.log('설정 상태:', results);

// 누락된 항목 확인
window.displaySetupStatus(results);
```

### 수동 확인
1. **Storage** 메뉴에서 `review-images`, `route-maps` 버킷이 보이는지 확인
2. **Table Editor**에서 `trip_reviews` 테이블에 `overall_review_image_url`, `route_map_image_url` 컬럼이 있는지 확인
3. **Table Editor**에서 `place_reviews` 테이블에 `image_url` 컬럼이 있는지 확인

## 5. 테스트

설정 완료 후 다음 기능을 테스트하세요:

1. **리뷰 이미지 업로드**
   - 로그인 후 리뷰 작성 페이지에서 이미지 업로드 테스트
   - 전체 리뷰 이미지와 장소별 이미지 모두 테스트

2. **지도 스크린샷 생성**
   - navigation 페이지에서 "환승 여행 종료하기" 클릭
   - 지도 스크린샷이 자동 생성되는지 확인

3. **리뷰 상세 페이지**
   - 리뷰 상세 페이지에서 이미지 및 지도 표시 확인
   - 지도 클릭 시 일정 가져오기 기능 확인

## 🔧 문제 해결

### 버킷이 보이지 않는 경우
- 버킷 이름이 정확한지 확인 (`review-images`, `route-maps`)
- Public 버킷으로 설정되었는지 확인
- 페이지를 새로고침해보세요

### 이미지 업로드 실패
- Storage Policies (RLS)가 올바르게 설정되었는지 확인
- 버킷이 Public으로 설정되었는지 확인
- 브라우저 콘솔에서 오류 메시지 확인

### 스키마 오류
- SQL이 정확히 실행되었는지 확인
- `IF NOT EXISTS`를 사용했는지 확인 (중복 실행 방지)
- Table Editor에서 컬럼이 실제로 추가되었는지 확인

## 📝 참고사항

- 이미지 업로드 실패 시 리뷰는 저장되지만 이미지는 포함되지 않습니다
- 지도 스크린샷 생성 실패 시에도 일정 저장은 정상적으로 진행됩니다
- 모든 이미지는 Supabase Storage에 저장되며 공개 URL로 접근 가능합니다
- IndexedDB는 자동으로 마이그레이션되므로 별도 설정이 필요 없습니다

