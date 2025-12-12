# Supabase RLS (Row Level Security) 설정 가이드

Auth0를 사용하는 경우 `profiles` 테이블에 대한 RLS 정책을 설정해야 합니다.

## 🔍 문제 증상

다음과 같은 오류가 발생하는 경우 RLS 정책이 설정되지 않은 것입니다:

```
GET /rest/v1/profiles?select=id&auth0_id=eq... 406 (Not Acceptable)
POST /rest/v1/profiles?select=id 401 (Unauthorized)
new row violates row-level security policy for table "profiles"
```

## 📋 설정 방법

### 1. Supabase 대시보드 접속

1. [Supabase Dashboard](https://app.supabase.com)에 로그인
2. 프로젝트 선택
3. 좌측 메뉴에서 **SQL Editor** 클릭
4. **"New query"** 클릭

### 2. RLS 정책 SQL 실행

다음 SQL을 복사하여 실행하세요:

```sql
-- profiles 테이블에 RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있으면 삭제 (선택사항)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- 모든 사용자가 자신의 프로필을 조회할 수 있도록 설정
-- Auth0를 사용하는 경우 anon key로 접근하므로 모든 사용자에게 읽기 권한 부여
CREATE POLICY "Users can read own profile" 
ON profiles FOR SELECT 
USING (true);

-- 모든 사용자가 자신의 프로필을 생성할 수 있도록 설정
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
WITH CHECK (true);

-- 모든 사용자가 자신의 프로필을 수정할 수 있도록 설정
-- auth0_id를 기반으로 자신의 프로필만 수정 가능하도록 제한할 수도 있음
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (true)
WITH CHECK (true);

-- 모든 사용자가 자신의 프로필을 삭제할 수 있도록 설정 (선택사항)
CREATE POLICY "Users can delete own profile" 
ON profiles FOR DELETE 
USING (true);
```

### 3. 더 안전한 정책 (권장)

Auth0 사용자 ID를 기반으로 자신의 프로필만 접근할 수 있도록 제한하려면:

```sql
-- profiles 테이블에 RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있으면 삭제
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- 자신의 프로필만 조회 가능
-- 주의: 이 정책은 현재 세션의 auth0_id를 확인할 수 없으므로,
-- 실제로는 모든 사용자가 모든 프로필을 조회할 수 있습니다.
-- Auth0를 사용하는 경우 세션 변수를 설정하는 별도의 함수가 필요합니다.
CREATE POLICY "Users can read own profile" 
ON profiles FOR SELECT 
USING (true);  -- 임시로 모든 사용자에게 읽기 권한 부여

-- 자신의 프로필만 생성 가능
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
WITH CHECK (true);

-- 자신의 프로필만 수정 가능
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (true)
WITH CHECK (true);
```

**참고**: Auth0를 사용하는 경우 Supabase의 기본 인증 시스템을 사용하지 않으므로, 세션 변수를 통해 현재 사용자 ID를 전달하는 별도의 메커니즘이 필요합니다. 현재는 모든 사용자에게 읽기/쓰기 권한을 부여하는 방식으로 설정되어 있습니다.

### 4. 설정 확인

SQL 실행 후 브라우저 콘솔에서 다음 명령어로 확인할 수 있습니다:

```javascript
// Supabase 프로필 동기화 테스트
const { getSupabaseUserId } = await import('./scripts/supabaseClient.js');
const auth0User = await window.getAuth0User(); // Auth0 사용자 정보 가져오기
if (auth0User) {
  try {
    const supabaseUserId = await getSupabaseUserId(auth0User.sub);
    console.log('✅ 프로필 동기화 성공:', supabaseUserId);
  } catch (error) {
    console.error('❌ 프로필 동기화 실패:', error);
  }
}
```

또는 페이지를 새로고침하여 콘솔 오류가 사라졌는지 확인하세요.

## 🔧 문제 해결

### RLS 정책이 적용되지 않는 경우

1. **SQL이 정확히 실행되었는지 확인**
   - SQL Editor에서 실행 결과 확인
   - 오류 메시지가 없는지 확인

2. **정책이 실제로 생성되었는지 확인**
   - Supabase 대시보드에서 **Authentication** > **Policies** 메뉴 확인
   - 또는 **Table Editor** > **profiles** 테이블 > **Policies** 탭 확인

3. **RLS가 활성화되었는지 확인**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' AND tablename = 'profiles';
   ```
   - `rowsecurity`가 `true`여야 합니다.

### 여전히 오류가 발생하는 경우

1. **브라우저 캐시 삭제**
   - 강력 새로고침 (Ctrl+Shift+R 또는 Cmd+Shift+R)

2. **Supabase 프로젝트 상태 확인**
   - 프로젝트가 일시 중지되지 않았는지 확인
   - API 키가 유효한지 확인

3. **정책 재생성**
   - 기존 정책을 모두 삭제하고 다시 생성

## 📝 참고사항

- **보안 고려사항**: 현재 설정은 모든 사용자에게 읽기/쓰기 권한을 부여합니다. 프로덕션 환경에서는 더 엄격한 정책을 고려해야 합니다.
- **Auth0 통합**: Auth0를 사용하는 경우 Supabase의 기본 인증 시스템과는 별도로 작동합니다. 세션 변수를 통해 사용자 ID를 전달하는 별도의 메커니즘이 필요할 수 있습니다.
- **다른 테이블**: `trip_reviews`, `place_reviews` 등 다른 테이블에도 RLS 정책이 필요할 수 있습니다.

## 🔗 관련 문서

- [Supabase RLS 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [Auth0 통합 가이드](https://supabase.com/docs/guides/auth/auth0)

