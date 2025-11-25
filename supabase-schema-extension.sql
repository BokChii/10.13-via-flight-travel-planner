-- Supabase 스키마 확장 SQL
-- 리뷰 이미지 및 지도 스크린샷 저장을 위한 컬럼 추가

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

