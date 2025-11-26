# 환승 여행 내비게이터 (Via Flight Travel Planner)

도보와 대중교통만으로 최적의 환승 일정을 계획하는 웹 애플리케이션입니다.

## 📋 목차

- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [시작하기](#-시작하기)
- [개발 환경 설정](#-개발-환경-설정)
- [배포](#-배포)
- [프로젝트 구조](#-프로젝트-구조)
- [트러블슈팅](#-트러블슈팅)
- [기여하기](#-기여하기)

## 🚀 주요 기능

- **멀티스텝 플래너**: 직관적인 3단계 일정 생성
- **실시간 네비게이션**: GPS 기반 위치 추적 및 진행률 표시
- **긴급 복귀 모드**: 공항 복귀 시간 부족 시 자동 알림
- **Google Maps 통합**: 실시간 경로 및 장소 검색
- **반응형 디자인**: 모바일과 데스크톱 모두 지원
- **영업 시간 확인**: POI의 실제 영업 시간을 고려한 일정 추천

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Maps**: Google Maps Platform (Maps, Places, Directions APIs)
- **Storage**: SessionStorage, SQLite (client-side)
- **Deployment**: GitHub Pages with GitHub Actions

## 🏁 시작하기

### 빠른 시작

1. **저장소 클론**
```bash
git clone https://github.com/BokChii/10.13-via-flight-travel-planner.git
cd 10.13-via-flight-travel-planner
```

2. **의존성 설치**
```bash
npm install
```

3. **환경 변수 설정**
```bash
cp env.example .env
# .env 파일을 열어 API 키 설정
```

4. **개발 서버 실행**
```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 🔧 개발 환경 설정

### 필요 조건

- **Node.js**: 18.0.0 이상
- **npm**: 9.0.0 이상 (또는 yarn)
- **Google Maps API 키**: [Google Cloud Console](https://console.cloud.google.com/)에서 발급

### 환경 변수 설정

`.env` 파일에 다음 변수들을 설정하세요:

```env
# Google Maps API 키 (필수)
GOOGLE_MAPS_API_KEY=your_api_key_here

# 이메일 전송 (선택)
RESEND_API_KEY=your_resend_key_here
EMAIL_FROM="Via Flight <no-reply@yourdomain.com>"
```

### Google Maps API 키 발급 가이드

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. 다음 API 활성화:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
   - **Geocoding API** (선택)
4. **사용자 인증 정보** > **API 키 만들기**
5. API 키 제한 설정 (권장):
   - HTTP 리퍼러(웹사이트) 제한 설정
   - 특정 API만 허용 설정

### 로컬 개발 서버

```bash
# 개발 서버 실행 (포트 5173)
npm run dev

# 또는
npm start
```

## 📱 사용 방법

1. **일정 생성**: 도착/복귀 공항 선택 및 시간 설정
2. **취향 설정**: 관심 카테고리 선택 (음식, 쇼핑, 문화 등)
3. **네비게이션**: 생성된 일정에 따라 실시간 안내

### 주요 페이지

- **Landing Page** (`index.html`): 서비스 소개 및 시작
- **Transfer Info** (`transfer-info.html`): 환승 정보 입력
- **Airport Main** (`airport-main.html`): 여행 스타일 선택
- **Airport Only** (`airport-only.html`): 공항 내부 일정 구성
- **Airport External** (`airport-external.html`): 도시 탐방 일정 구성
- **Navigation** (`navigation.html`): 실시간 네비게이션
- **Trip Summary** (`trip-summary.html`): 일정 요약

## 📂 프로젝트 구조

```
.
├── scripts/              # JavaScript 모듈
│   ├── api.js           # Google Maps API 통신
│   ├── config.js        # 설정 및 상수
│   ├── main.js          # 메인 애플리케이션 로직
│   ├── router.js        # 페이지 라우팅
│   ├── errorHandler.js  # 공통 에러 처리
│   ├── validation.js    # 데이터 검증
│   └── ...
├── styles/              # CSS 스타일시트
│   ├── main.css         # 메인 스타일
│   ├── components/      # 컴포넌트 스타일
│   └── pages/           # 페이지별 스타일
├── data/                # 데이터베이스 파일
│   └── airport.db       # SQLite 데이터베이스
├── tools/               # 빌드 도구
│   └── inject-env.js    # 환경 변수 주입
├── index.html           # 진입점 (랜딩 페이지)
├── navigation.html      # 네비게이션 페이지
└── package.json         # 프로젝트 설정
```

## 🌐 배포

이 프로젝트는 GitHub Pages를 통해 자동 배포됩니다.

### GitHub Secrets 설정

배포 전에 GitHub 저장소의 Secrets에 다음 환경 변수를 설정해야 합니다:

1. GitHub 저장소로 이동
2. **Settings** > **Secrets and variables** > **Actions** 클릭
3. **New repository secret** 버튼 클릭
4. 다음 Secrets를 추가:

| Secret 이름 | 설명 | 필수 여부 |
|------------|------|----------|
| `GOOGLE_MAPS_API_KEY` | Google Maps API 키 | ✅ 필수 |
| `OPENAI_API_KEY` | OpenAI API 키 | ✅ 필수 |
| `SUPABASE_URL` | Supabase 프로젝트 URL | ✅ 필수 |
| `SUPABASE_ANON_KEY` | Supabase Anon Key | ✅ 필수 |
| `RESEND_API_KEY` | Resend 이메일 API 키 | ⚠️ 선택 |
| `EMAIL_FROM` | 발신자 이메일 주소 | ⚠️ 선택 |

### 배포 프로세스

1. `main` 브랜치에 푸시하면 자동으로 배포됩니다
2. GitHub Actions 워크플로우가 환경 변수를 주입하고 빌드합니다
3. 빌드된 파일이 GitHub Pages에 배포됩니다

**참고**: 
- GitHub Pages 설정에서 Source를 **GitHub Actions**로 설정해야 합니다
- Settings > Pages > Source: **GitHub Actions** 선택

### 수동 배포

```bash
# 환경 변수 주입
npm run prepare

# 빌드된 파일이 dist/ 디렉토리에 생성됩니다
```

## 🐛 트러블슈팅

### 지도가 표시되지 않음

**증상**: 지도 영역이 비어있거나 에러 메시지 표시

**해결 방법**:
1. Google Maps API 키가 올바르게 설정되었는지 확인
   - HTML 파일의 `<meta name="google-maps-api-key">` 확인
   - 또는 `.env` 파일의 `GOOGLE_MAPS_API_KEY` 확인
2. 브라우저 콘솔에서 에러 메시지 확인 (F12)
3. Google Cloud Console에서 API 사용량 및 제한 확인
4. API 키에 필요한 API가 모두 활성화되어 있는지 확인

### 일정이 저장되지 않음

**증상**: 페이지 새로고침 시 일정이 사라짐

**해결 방법**:
1. 브라우저의 sessionStorage가 활성화되어 있는지 확인
2. 시크릿 모드에서는 sessionStorage가 제한될 수 있음
3. 브라우저 저장소 용량 확인 (다른 탭에서 사용량이 많으면 제한될 수 있음)

### POI 검색이 작동하지 않음

**증상**: 장소 검색 시 결과가 없거나 에러 발생

**해결 방법**:
1. Places API가 활성화되어 있는지 확인
2. API 키에 Places API 권한이 있는지 확인
3. API 할당량(Quota) 초과 여부 확인
4. 네트워크 연결 상태 확인

### 경로 계산이 실패함

**증상**: 경로 찾기 버튼 클릭 시 "경로를 불러올 수 없습니다" 메시지

**해결 방법**:
1. Directions API가 활성화되어 있는지 확인
2. 출발지와 도착지 주소가 올바른지 확인
3. 네트워크 연결 상태 확인
4. Google Maps API 할당량 확인

### 타imer 관련 성능 문제

**증상**: 페이지가 느려지거나 메모리 사용량 증가

**해결 방법**:
1. 브라우저 개발자 도구의 Performance 탭에서 확인
2. 페이지 전환 시 타이머가 정리되는지 확인
3. 메모리 누수 확인 (개발자 도구 > Memory)

## 🤝 기여하기

기여는 언제나 환영합니다!

1. 이 저장소를 Fork합니다
2. 기능 브랜치를 만듭니다 (`git checkout -b feature/AmazingFeature`)
3. 변경 사항을 커밋합니다 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/AmazingFeature`)
5. Pull Request를 엽니다

### 코딩 스타일

- ES6+ 문법 사용
- 함수/변수명은 camelCase
- 파일명은 camelCase 또는 kebab-case
- JSDoc 주석을 복잡한 함수에 추가
- 에러 처리는 `errorHandler.js`의 공통 함수 사용

### 커밋 메시지

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가
chore: 빌드/설정 변경
```

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 등록해주세요.

---

**Made with ❤️ for travelers**
