import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const templatePath = path.join(projectRoot, 'navigation.html');
const plannerTemplatePath = path.join(projectRoot, 'index.html');
const tripSummaryTemplatePath = path.join(projectRoot, 'trip-summary.html');
const airportOnlyPath = path.join(projectRoot, 'airport-only.html');
const airportExternalPath = path.join(projectRoot, 'airport-external.html');
const distDir = path.join(projectRoot, 'dist');
const distIndexPath = path.join(distDir, 'navigation.html');
const distPlannerPath = path.join(distDir, 'index.html');
const distAirportOnlyPath = path.join(distDir, 'airport-only.html');
const distAirportExternalPath = path.join(distDir, 'airport-external.html');

// 환경 변수에서 API 키 가져오기 (GitHub Actions용)
let apiKey = process.env.GOOGLE_MAPS_API_KEY;
let openaiKey = process.env.OPENAI_API_KEY;
let resendKey = process.env.RESEND_API_KEY;
let emailFrom = process.env.EMAIL_FROM;
// 환경 변수에서 Supabase 정보 가져오기
let supabaseUrl = process.env.SUPABASE_URL;
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// .env 파일이 있으면 파일에서도 읽기 (로컬 개발용)
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envMap = Object.fromEntries(
    envContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim()];
      })
  );
  apiKey = envMap.GOOGLE_MAPS_API_KEY || apiKey;
  openaiKey = envMap.OPENAI_API_KEY || openaiKey;
  resendKey = envMap.RESEND_API_KEY || resendKey;
  emailFrom = envMap.EMAIL_FROM || emailFrom;
  supabaseUrl = envMap.SUPABASE_URL || supabaseUrl;
  supabaseAnonKey = envMap.SUPABASE_ANON_KEY || supabaseAnonKey;
}

// 디버깅: Supabase 환경 변수 확인
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[inject-env] ⚠️ Supabase 환경 변수가 없습니다.');
  console.warn('[inject-env] SUPABASE_URL:', supabaseUrl || '없음');
  console.warn('[inject-env] SUPABASE_ANON_KEY:', supabaseAnonKey ? '있음 (길이: ' + supabaseAnonKey.length + ')' : '없음');
  console.warn('[inject-env] .env 파일 경로:', envPath);
  console.warn('[inject-env] .env 파일 존재:', fs.existsSync(envPath));
}

if (!apiKey) {
  console.error('[inject-env] GOOGLE_MAPS_API_KEY를 찾을 수 없습니다. 환경 변수나 .env 파일을 확인하세요.');
  process.exit(1);
}

if (!fs.existsSync(templatePath)) {
  console.error('[inject-env] navigation.html 템플릿을 찾을 수 없습니다.');
  process.exit(1);
}

if (!fs.existsSync(plannerTemplatePath)) {
  console.error('[inject-env] index.html 템플릿을 찾을 수 없습니다.');
  process.exit(1);
}

if (!fs.existsSync(tripSummaryTemplatePath)) {
  console.error('[inject-env] trip-summary.html 템플릿을 찾을 수 없습니다.');
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Supabase meta 태그 주입 헬퍼 함수
function injectSupabaseMeta(html) {
  let injected = html;
  
  // Supabase URL meta 태그 추가/업데이트
  if (supabaseUrl) {
    // 더 유연한 정규식 패턴 (공백 허용)
    const urlMetaPattern = /<meta\s+name=["']supabase-url["']\s+content=["'][^"']*["']\s*\/?>/;
    const urlMetaTag = `<meta name="supabase-url" content="${supabaseUrl}" />`;
    
    if (urlMetaPattern.test(injected)) {
      injected = injected.replace(urlMetaPattern, urlMetaTag);
      console.log('[inject-env] ✅ Supabase URL meta 태그 업데이트 완료');
    } else {
      // head 태그 안에 추가 (google-maps-api-key 다음에)
      injected = injected.replace(
        /(<meta name="google-maps-api-key" content="[^"]*" \/>)/,
        `$1\n    <meta name="supabase-url" content="${supabaseUrl}" />`
      );
    }
  }
  
  // Supabase Anon Key meta 태그 추가/업데이트
  if (supabaseAnonKey) {
    // 더 유연한 정규식 패턴 (공백 허용)
    const keyMetaPattern = /<meta\s+name=["']supabase-anon-key["']\s+content=["'][^"']*["']\s*\/?>/;
    const keyMetaTag = `<meta name="supabase-anon-key" content="${supabaseAnonKey}" />`;
    
    if (keyMetaPattern.test(injected)) {
      injected = injected.replace(keyMetaPattern, keyMetaTag);
      console.log('[inject-env] ✅ Supabase anon key meta 태그 업데이트 완료');
    } else {
      // supabase-url 다음에 추가
      if (supabaseUrl) {
        injected = injected.replace(
          /(<meta name="supabase-url" content="[^"]*" \/>)/,
          `$1\n    <meta name="supabase-anon-key" content="${supabaseAnonKey}" />`
        );
      } else {
        // supabase-url이 없으면 google-maps-api-key 다음에 추가
        injected = injected.replace(
          /(<meta name="google-maps-api-key" content="[^"]*" \/>)/,
          `$1\n    <meta name="supabase-anon-key" content="${supabaseAnonKey}" />`
        );
      }
    }
  }
  
  return injected;
}

const templateHtml = fs.readFileSync(templatePath, 'utf8');
let injectedHtml = templateHtml.replace(
  /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
  `$1${apiKey}$3`
);
injectedHtml = injectSupabaseMeta(injectedHtml);

const plannerTemplateHtml = fs.readFileSync(plannerTemplatePath, 'utf8');
let injectedPlannerHtml = plannerTemplateHtml.replace(
  /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
  `$1${apiKey}$3`
);
injectedPlannerHtml = injectSupabaseMeta(injectedPlannerHtml);

fs.writeFileSync(distIndexPath, injectedHtml, 'utf8');
fs.writeFileSync(distPlannerPath, injectedPlannerHtml, 'utf8');

// trip-summary.html에 클라이언트용 ENV 주입 (로컬/정적 테스트용)
const tripSummaryHtml = fs.readFileSync(tripSummaryTemplatePath, 'utf8');
let injectedTripSummaryHtml = tripSummaryHtml.replace(
  /<\/head>/,
  () => {
    const lines = [];
    if (apiKey) {
      lines.push(`<meta name="google-maps-api-key" content="${apiKey}" />`);
    }
    if (supabaseUrl) {
      lines.push(`<meta name="supabase-url" content="${supabaseUrl}" />`);
    }
    if (supabaseAnonKey) {
      lines.push(`<meta name="supabase-anon-key" content="${supabaseAnonKey}" />`);
    }
    // 브라우저에서 직접 테스트할 수 있도록 주입 (보안상 배포 시 비활성 권장)
    if (resendKey || emailFrom) {
      lines.push('<script>');
      if (resendKey) lines.push(`window.RESEND_API_KEY = ${JSON.stringify(resendKey)};`);
      if (emailFrom) lines.push(`window.EMAIL_FROM = ${JSON.stringify(emailFrom)};`);
      lines.push('</script>');
    }
    lines.push('</head>');
    return lines.join('\n');
  }
);
injectedTripSummaryHtml = injectSupabaseMeta(injectedTripSummaryHtml);

const distTripSummaryPath = path.join(distDir, 'trip-summary.html');
fs.writeFileSync(distTripSummaryPath, injectedTripSummaryHtml, 'utf8');

// airport-only.html 처리
if (fs.existsSync(airportOnlyPath)) {
  let airportOnlyHtml = fs.readFileSync(airportOnlyPath, 'utf8');
  // Google Maps API 키 주입
  airportOnlyHtml = airportOnlyHtml.replace(
    /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
    `$1${apiKey}$3`
  );
  // OpenAI API 키 주입
  airportOnlyHtml = airportOnlyHtml.replace(
    /(<meta name="openai-api-key" content=")([^"]*)(" \/>)/,
    openaiKey ? `$1${openaiKey}$3` : '$1YOUR_OPENAI_API_KEY$3'
  );
  // Supabase meta 태그 주입
  airportOnlyHtml = injectSupabaseMeta(airportOnlyHtml);
  fs.writeFileSync(distAirportOnlyPath, airportOnlyHtml, 'utf8');
}

// airport-external.html 처리
if (fs.existsSync(airportExternalPath)) {
  let airportExternalHtml = fs.readFileSync(airportExternalPath, 'utf8');
  // Google Maps API 키 주입
  airportExternalHtml = airportExternalHtml.replace(
    /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
    `$1${apiKey}$3`
  );
  // OpenAI API 키 주입
  airportExternalHtml = airportExternalHtml.replace(
    /(<meta name="openai-api-key" content=")([^"]*)(" \/>)/,
    openaiKey ? `$1${openaiKey}$3` : '$1YOUR_OPENAI_API_KEY$3'
  );
  // Supabase meta 태그 주입
  airportExternalHtml = injectSupabaseMeta(airportExternalHtml);
  fs.writeFileSync(distAirportExternalPath, airportExternalHtml, 'utf8');
}

// 나머지 HTML 파일들 복사 및 Supabase meta 태그 주입
const htmlFilesToCopy = [
  'index.html',
  'airport-main.html',
  'transfer-info.html',
  'review-detail.html',
  'profile.html'
];

htmlFilesToCopy.forEach(htmlFile => {
  const srcPath = path.join(projectRoot, htmlFile);
  const destPath = path.join(distDir, htmlFile);
  if (fs.existsSync(srcPath)) {
    // 파일을 읽어서 API 키 및 Supabase meta 태그 주입 후 저장
    let htmlContent = fs.readFileSync(srcPath, 'utf8');
    
    // Google Maps API 키 주입 (모든 파일)
    htmlContent = htmlContent.replace(
      /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
      `$1${apiKey}$3`
    );
    
    // OpenAI API 키 주입 (airport-main.html인 경우)
    if (htmlFile === 'airport-main.html') {
      htmlContent = htmlContent.replace(
        /(<meta name="openai-api-key" content=")([^"]*)(" \/>)/,
        openaiKey ? `$1${openaiKey}$3` : '$1YOUR_OPENAI_API_KEY$3'
      );
    }
    
    // Supabase meta 태그 주입
    htmlContent = injectSupabaseMeta(htmlContent);
    
    // 파일 저장
    fs.writeFileSync(destPath, htmlContent, 'utf8');
    console.log(`[inject-env] ${htmlFile} 복사 및 meta 태그 주입 완료`);
  }
});

// 필요한 폴더들 복사
copyDir(path.join(projectRoot, 'styles'), path.join(distDir, 'styles'));
copyDir(path.join(projectRoot, 'scripts'), path.join(distDir, 'scripts'));
copyDir(path.join(projectRoot, 'api'), path.join(distDir, 'api'));
copyDir(path.join(projectRoot, 'data'), path.join(distDir, 'data')); // data 폴더 추가 (SQLite DB 등)
copyDir(path.join(projectRoot, 'assets'), path.join(distDir, 'assets')); // assets 폴더 추가 (있을 경우)

console.log('[inject-env] dist/ 폴더에 API 키가 주입된 정적 파일을 생성했습니다.');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}