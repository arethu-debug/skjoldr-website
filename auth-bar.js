// SKJOLDR — signed-in user bar.
// Asks /api/me who is signed in and adds "<name> · Log out" to the
// right-hand side of the top nav (or a small fixed bar if a page has no nav).
(function () {
  function render(user) {
    const bar = document.createElement('div');
    bar.className = 'user-bar';

    const name = document.createElement('span');
    name.className = 'user-bar__name';
    name.textContent = user.name;

    const logout = document.createElement('a');
    logout.className = 'user-bar__logout';
    logout.href = '/api/logout';
    logout.textContent = 'Log out';

    bar.append(name, logout);

    const navSwitcher = document.querySelector('.nav .lang-switcher');
    if (navSwitcher && navSwitcher.parentElement) {
      navSwitcher.parentElement.appendChild(bar);
    } else {
      bar.classList.add('user-bar--floating');
      document.body.appendChild(bar);
    }
  }

  function load() {
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(user => { if (user && user.name) render(user); })
      .catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
