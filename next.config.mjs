/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone 배포 — .next/standalone 산출물 생성 (Dockerfile이 이걸 복사함)
  output: 'standalone',
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
