// MathJax の version.js は PACKAGE_VERSION が未定義だと Node.js 用の require を使おうとして
// ブラウザで失敗するため、MathJax 本体より先に定義しておく。
(globalThis as unknown as { PACKAGE_VERSION: string }).PACKAGE_VERSION = '3.2.1';

export {};
