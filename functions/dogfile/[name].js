// 손님이 만든 아이의 3D 몸(.glb, 약 4.5MB)을 Cloudflare 가 대신 내준다(2026-11-11 사용자 "동시접속 500명까지 가능하도록. 아무 문제 없이").
// 500명 시험에서 처음 온 사람들이 우리 서버(api.meongwol.co.kr)에서 3D 몸을 한꺼번에 받느라 평균 54초가 걸리고 4번 실패했고,
// 그동안 서버의 다른 대답(로그인 등)도 수십 초 늦어졌다. 이제 한 번 받은 몸은 Cloudflare 가 기억해 두고 내주므로 우리 서버는 처음 한 번만 보낸다.
// 멍월 사이트 저장소(mypet-pages·mypet-preview)의 functions/ 로 복사된다(원본은 강스타/pages-functions). 화면은 aiDog.ts glbFile 이 이 주소를 쓴다.
// 다 만든 몸(서버가 max-age 를 붙여 주는 것)만 기억한다. 만드는 중인 몸은 그대로 지나간다.
// 기억은 하루: 몸을 다시 만들어 바꾸는 일이 있어도 하루 안에 새 몸으로 바뀐다.
// 판 번호(?v=, 몸 json 의 bodyV)가 붙으면 그 판끼리 따로 기억한다: 몸을 바꾸면 바로 새 몸이 나간다(2026-11-12 릴리).
const NAME = /^mine-[0-9a-f]{8}\.glb$/;
const KEEP = 'public, max-age=86400';
// glb 가 끝까지 왔는지: 'glTF' 로 시작하고, 9~12번째 바이트에 적힌 전체 길이와 받은 길이가 같다
const whole = (buf) => {
  if (buf.byteLength < 12) return false;
  const v = new DataView(buf);
  return v.getUint32(0, true) === 0x46546c67 && v.getUint32(8, true) === buf.byteLength;
};

export async function onRequestGet({ params, request, waitUntil, env }) {
  const name = String(params.name ?? '');
  if (!NAME.test(name)) return new Response('없는 파일이에요', { status: 404 });
  const cache = caches.default;
  const v = new URL(request.url).searchParams.get('v') ?? '';
  const ver = /^[0-9a-z-]{1,24}$/.test(v) ? `?v=${v}` : '';
  const key = new Request(new URL(`/dogfile/${name}${ver}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) {
    // (기억해 둔 것이 반쪽이면 버리고 새로 받는다: 2026-11-27 코코, 받는 도중 끊긴 몸이 기억된 일)
    const kept = await hit.arrayBuffer().catch(() => null);
    if (kept && whole(kept)) {
      const again = new Response(kept, hit);
      again.headers.set('X-Meongwol-Edge', 'hit'); // (확인용: Cloudflare 가 기억해 둔 것을 냈다)
      return again;
    }
    await cache.delete(key).catch(() => {});
  }
  // R2 진열대(2026-11-27 대표님 "R2 만들어", server/r2-dogs.sh 가 2분마다 올린다): 있으면 우리 서버까지 가지 않고 바로 낸다.
  // 판 번호가 붙은 주소는 그 판의 자리(v-<판>.glb)만 본다. 없거나 반쪽이면 예전처럼 우리 서버에서 받는다
  if (env?.DOGS) {
    try {
      const id = name.slice(0, -'.glb'.length);
      const obj = await env.DOGS.get(`dogs/${id}/${ver ? `v-${v}` : 'base'}.glb`);
      const shelf = obj ? await obj.arrayBuffer() : null;
      if (shelf && whole(shelf)) {
        const headers = { 'Content-Type': 'model/gltf-binary', 'Cache-Control': KEEP, 'X-Meongwol-Edge': 'r2', 'Content-Length': String(shelf.byteLength) };
        waitUntil(cache.put(key, new Response(shelf, { status: 200, headers })));
        return new Response(shelf, { status: 200, headers });
      }
    } catch {
      /* R2 가 안 되면 우리 서버로 */
    }
  }
  // (2026-11-26 모카: 예전에는 받는 대로 손님에게 보내면서 동시에 기억해 두었는데, 손님이 받는 도중 끊기자 기억하던 것도 반쯤에서 멈추고
  //  그 뒤 이 주소를 찾는 사람이 몇 시간 동안 끝없이 기다렸다. 이제 우리 서버에서 끝까지 다 받은 다음(6초 넘으면 포기: 화면이 곧장 우리 서버로 간다) 기억하고 내보낸다. 우리 서버는 0.1초)
  let origin;
  let data;
  try {
    origin = await fetch(`https://api.meongwol.co.kr/models/dogs/${name}${ver}`, { signal: AbortSignal.timeout(6000) });
    if (!origin.ok) return new Response(null, { status: origin.status, headers: { 'Cache-Control': 'no-store' } });
    data = await origin.arrayBuffer();
    if (!whole(data)) throw new Error('덜 왔음');
  } catch {
    return new Response('잠시 뒤 다시', { status: 504, headers: { 'Cache-Control': 'no-store' } });
  }
  const done = /max-age=\d+/.test(origin.headers.get('Cache-Control') ?? '');
  const headers = { 'Content-Type': 'model/gltf-binary', 'Cache-Control': done ? KEEP : 'no-store', 'X-Meongwol-Edge': 'miss', 'Content-Length': String(data.byteLength) };
  if (done) waitUntil(cache.put(key, new Response(data, { status: 200, headers })));
  return new Response(data, { status: 200, headers });
}
