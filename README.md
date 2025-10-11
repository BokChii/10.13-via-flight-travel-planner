# Via Flight Travel Planner

도보와 대중교통만으로 최적의 환승 여행 일정을 계획하는 웹 애플리케이션입니다.

## 🚀 주요 기능

- **동적 공항 선택**: 전 세계 주요 공항 선택 및 커스텀 입력
- **실시간 경유지 추천**: Google Places API를 활용한 맞춤형 장소 추천
- **체류 시간 최적화**: 각 경유지별 체류 시간 설정 및 수정
- **실시간 네비게이션**: GPS 기반 실시간 위치 추적 및 안내
- **복귀 시간 관리**: 출발 시간까지의 여유 시간 계산 및 알림

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Maps**: Google Maps Platform (Maps, Places, Directions APIs)
- **Build**: Node.js, npm
- **Deployment**: Netlify

## 📦 설치 및 실행

### 로컬 개발

1. 저장소 클론
```bash
git clone <repository-url>
cd codex_navigation
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
```bash
cp env.example .env
# .env 파일에서 GOOGLE_MAPS_API_KEY를 설정하세요
```

4. 개발 서버 실행
```bash
npm run dev
```

### 배포용 빌드

```bash
npm run prepare
# dist/ 폴더에 배포용 파일이 생성됩니다
```

## 🔑 Google Maps API 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. 다음 API 활성화:
   - Maps JavaScript API
   - Places API
   - Directions API
3. API 키 생성 및 `.env` 파일에 설정

## 🌐 배포

### Netlify

1. Netlify에 GitHub 저장소 연결
2. 환경 변수 설정:
   - `GOOGLE_MAPS_API_KEY`: Google Maps API 키
3. 빌드 설정:
   - Build command: `npm run prepare`
   - Publish directory: `dist`

## 📱 반응형 지원

- **Desktop**: 3열 레이아웃 (컨트롤, 지도, 요약)
- **Tablet**: 1열 레이아웃 (지도 우선)
- **Mobile**: 최적화된 터치 인터페이스

## 🎯 주요 개선사항

- ✅ 복귀 시간 강조 UI
- ✅ 네비게이션 상태 인디케이터
- ✅ 체류 시간 최적화
- ✅ PC 네비게이션 모드 개선
- ✅ 사용자 편의성 향상

## 📄 라이선스

MIT License
