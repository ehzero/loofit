# 루핏 소개 사이트

루핏 모바일 앱과 독립적으로 설치·빌드되는 Astro 정적 사이트입니다.

## 로컬 실행

```sh
cd website
npm install
npm run dev
```

## 검증

```sh
npm run check
npm run build
```

`website/`는 자체 `package.json`과 `package-lock.json`을 사용합니다. 루트 Expo 프로젝트의 의존성, 스크립트, 네이티브 빌드 설정에는 연결하지 않습니다.
