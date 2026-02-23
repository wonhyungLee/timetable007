# 시간표 조율 프로그램 (React + Vite)

`app.jsx` 기반으로 Vite React 프로젝트로 구성했고, Supabase Realtime 연동을 추가했습니다.

## 1) 로컬 실행

```bash
npm install --no-bin-links
npm run dev
```

- ChromeOS `MyFiles` 경로에서는 심볼릭 링크 권한 문제로 `--no-bin-links`가 필요할 수 있습니다.
- 접속 주소: `http://localhost:5173`

## 2) 빌드

```bash
npm run build
```

빌드 결과는 `dist/` 폴더에 생성됩니다.

## 3) 실시간 협업 설정 (Supabase)

1. Supabase SQL Editor에서 `supabase/schema.sql` 실행
2. `.env.example`를 `.env`로 복사 후 값 입력

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

3. 다시 실행

```bash
npm run dev
```

- 설정이 완료되면 상단에 `실시간 동기화 연결됨` 상태가 표시됩니다.
- 설정하지 않으면 자동으로 로컬 모드로 동작합니다.

## 4) Cloudflare Pages 배포

현재 앱은 프론트엔드 단독 구조라서 정적 배포가 가장 안정적이고 동시접속에 강합니다.

- 1순위: Cloudflare Pages
- 대안: Netlify / Vercel
- 매우 단순 대안: GitHub Pages

Cloudflare Pages에서 설정:
- Build command: `npm run build`
- Build output directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 권장 이유
- CDN 기반이라 동시접속 처리에 유리
- 무료 플랜으로도 트래픽 대응력이 높음
- 운영 난이도가 낮음

## 5) 1년 무료 동시접속 운영 전략

## A. 데이터 공유가 필요 없는 경우 (사용자별 개별 사용)
- Cloudflare Pages에 `dist/` 배포만으로 충분
- 사실상 가장 오래, 가장 안정적으로 무료 운영 가능

## B. 여러 사용자가 같은 시간표를 함께 수정해야 하는 경우
- 프론트: Cloudflare Pages
- 백엔드(무료): Supabase(FREE) 또는 Firebase Spark

주의:
- "완전 무료 + 무제한 동시접속"은 현실적으로 불가
- 무료 DB 플랜은 저장량/요청량 제한이 있어 사용량 증가 시 유료 전환 필요
- 학교/학년 전체 동시편집 수준이면 초기부터 사용량 모니터링 필요

## 6) 이번 구성 변경 사항

- `src/App.jsx`: 기존 `app.jsx`를 React 앱으로 이전
- `src/App.jsx`: "전체 초기화" 시 주차별 데이터 구조가 깨지던 문제 수정
- `src/App.jsx`: Supabase 기반 실시간 동기화(초기 로드, 변경 업서트, 원격 변경 반영) 추가
- `src/lib/supabaseClient.js`: Supabase 클라이언트 초기화 추가
- `supabase/schema.sql`: 공유 상태 테이블/RLS/Realtime publication 추가
- `src/main.jsx`, `src/index.css`: 앱 엔트리/스타일 추가
- `tailwind.config.js`, `postcss.config.js`: Tailwind 설정 추가
- `vite.config.js`, `index.html`, `package.json`: 빌드/실행 환경 구성
- `CLOUDFLARE_SUPABASE_SETUP.md`: 배포+연동 상세 절차 추가
