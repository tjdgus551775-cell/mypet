// 손님이 만든 아이의 3D 몸(.glb, 약 4.5MB)을 Cloudflare 가 대신 내준다(2026-11-11 사용자 "동시접속 500명까지 가능하도록. 아무 문제 없이").
// 500명 시험에서 처음 온 사람들이 우리 서버(api.meongwol.co.kr)에서 3D 몸을 한꺼번에 받느라 평균 54초가 걸리고 4번 실패했고,
// 그동안 서버의 다른 대답(로그인 등)도 수십 초 늦어졌다. 이제 한 번 받은 몸은 Cloudflare 가 기억해 두고 내주므로 우리 서버는 처음 한 번만 보낸다.
// 멍월 사이트 저장소(mypet-pages·mypet-preview)의 functions/ 로 복사된다(원본은 강스타/pages-functions). 화면은 aiDog.ts glbFile 이 이 주소를 쓴다.
// 다 만든 몸(서버가 max-age 를 붙여 주는 것)만 기억한다. 만드는 중인 몸은 그대로 지나간다.
// 기억은 하루: 몸을 다시 만들어 바꾸는 일이 있어도 하루 안에 새 몸으로 바뀐다.
const NAME = /^mine-[0-9a-f]{8}\.glb$/;
const KEEP = 'public, max-age=86400';

export async function onRequestGet({ params, request, waitUntil }) {
  const name = String(params.name ?? '');
  if (!NAME.test(name)) return new Response('없는 파일이에요', { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(`/dogfile/${name}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) {
    const again = new Response(hit.body, hit);
    again.headers.set('X-Meongwol-Edge', 'hit'); // (확인용: Cloudflare 가 기억해 둔 것을 냈다)
    return again;
  }
  const origin = await fetch(`https://api.meongwol.co.kr/models/dogs/${name}`);
  if (!origin.ok) return new Response(origin.body, { status: origin.status, headers: { 'Cache-Control': 'no-store' } });
  const done = /max-age=\d+/.test(origin.headers.get('Cache-Control') ?? '');
  const headers = { 'Content-Type': 'model/gltf-binary', 'Cache-Control': done ? KEEP : 'no-store', 'X-Meongwol-Edge': 'miss' };
  const length = origin.headers.get('Content-Length');
  if (length) headers['Content-Length'] = length;
  const res = new Response(origin.body, { status: 200, headers });
  if (done) waitUntil(cache.put(key, res.clone()));
  return res;
}
