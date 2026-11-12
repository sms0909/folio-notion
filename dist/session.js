// 로그인 상태와 서버 요청 도우미.
// 서버가 화면에 함께 넣어 준 로그인 상태를 읽는다.
export const session = { state: 'anonymous', user: null, csrf: null, lockedUntil: 0, ...JSON.parse(document.querySelector('#folio-session')?.textContent || '{}') };

// `text` is a body that is already JSON; `keepalive` lets the request outlive the page.
export async function api(path, { method = 'GET', body, text, keepalive = false } = {}) {
  const headers = {};
  if (method !== 'GET' && session.csrf) headers['x-csrf-token'] = session.csrf;
  if (text === undefined && body !== undefined) text = JSON.stringify(body);
  if (text !== undefined) headers['content-type'] = 'application/json';
  let response;
  try { response = await fetch(path, { method, headers, credentials: 'same-origin', body: text, keepalive }); }
  catch { throw Object.assign(new Error('서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'), { status: 0 }); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status: response.status, data });
  if (data.csrf) session.csrf = data.csrf;
  return data;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/';
}
