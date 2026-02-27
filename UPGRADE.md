# Upgrade Guide

## 1.0.0 → 1.1.0

이번 업데이트는 **전담 수업 이동 시 자동 해결안(Plan) 제안**이 핵심이며,
Supabase 스키마 변경은 없습니다.

### 로컬 실행

```bash
npm install --no-bin-links
npm run dev
```

### 배포(Cloudflare Pages / Netlify / Vercel)

```bash
npm install --no-bin-links
npm run build
```

- 빌드 결과물: `dist/`
- 정적 배포 설정은 기존과 동일합니다.

### 롤백

- Git을 사용한다면: 이전 커밋/태그로 체크아웃 후 다시 `npm run build`.
- 정적 배포라면: 이전에 배포했던 `dist/` 산출물로 되돌리면 됩니다.


## 1.1.0 → 1.2.0

이번 업데이트는 **전담 수업 교환 시 자동 해결안(Plan) 제안**이 핵심이며,
Supabase 스키마 변경은 없습니다.

### 로컬 실행

```bash
npm install --no-bin-links
npm run dev
```

### 배포(Cloudflare Pages / Netlify / Vercel)

```bash
npm install --no-bin-links
npm run build
```

- 빌드 결과물: `dist/`
- 정적 배포 설정은 기존과 동일합니다.

### 롤백

- Git을 사용한다면: 이전 커밋/태그로 체크아웃 후 다시 `npm run build`.
- 정적 배포라면: 이전에 배포했던 `dist/` 산출물로 되돌리면 됩니다.
