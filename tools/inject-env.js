import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const templatePath = path.join(projectRoot, 'navigation.html');
const plannerTemplatePath = path.join(projectRoot, 'index.html');
const distDir = path.join(projectRoot, 'dist');
const distIndexPath = path.join(distDir, 'navigation.html');
const distPlannerPath = path.join(distDir, 'index.html');

// 환경 변수에서 API 키 가져오기 (GitHub Actions용)
let apiKey = process.env.GOOGLE_MAPS_API_KEY;

// .env 파일이 있으면 파일에서도 읽기 (로컬 개발용)
if (!apiKey && fs.existsSync(envPath)) {
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
  apiKey = envMap.GOOGLE_MAPS_API_KEY;
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

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

const templateHtml = fs.readFileSync(templatePath, 'utf8');
const injectedHtml = templateHtml.replace(
  /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
  `$1${apiKey}$3`
);

const plannerTemplateHtml = fs.readFileSync(plannerTemplatePath, 'utf8');
const injectedPlannerHtml = plannerTemplateHtml.replace(
  /(<meta name="google-maps-api-key" content=")([^"]*)(" \/>)/,
  `$1${apiKey}$3`
);

fs.writeFileSync(distIndexPath, injectedHtml, 'utf8');
fs.writeFileSync(distPlannerPath, injectedPlannerHtml, 'utf8');

copyDir(path.join(projectRoot, 'styles'), path.join(distDir, 'styles'));
copyDir(path.join(projectRoot, 'scripts'), path.join(distDir, 'scripts'));

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