from pathlib import Path
import re,hashlib,json
root=Path(r'D:\Dhesta\Project\bleumflowers_bandung\bleum-flowers')
h=(root/'index.html').read_text(encoding='utf-8');c=(root/'css/style.css').read_text(encoding='utf-8');j=(root/'js/script.js').read_text(encoding='utf-8')
before={'outsideHero':hashlib.sha256(re.sub(r'<section id="beranda".*?</section>','',h,flags=re.S).encode()).hexdigest(),'js':j}
Path(r'D:\Dhesta\Project\Website-Promax\video-before.json').write_text(json.dumps(before),encoding='utf-8')
h=re.sub(r'      <div class="hero-image">.*?</div></div>\n','',h,count=1)
media='''
      <div class="hero-media" aria-hidden="true">
        <img class="hero-poster" src="assets/images/hills.jpg" alt="" fetchpriority="high">
        <video class="hero-video" autoplay muted loop playsinline preload="metadata" poster="assets/images/hills.jpg" data-src="assets/videos/hills.mp4" tabindex="-1"></video>
      </div>
      <div class="hero-overlay" aria-hidden="true"></div>
      <button class="hero-video-toggle" type="button" aria-label="Jeda video latar" aria-pressed="false" hidden>Jeda video <span aria-hidden="true">Ⅱ</span></button>'''
h=h.replace('<section id="beranda" class="hero" aria-labelledby="hero-title">','<section id="beranda" class="hero" aria-labelledby="hero-title">'+media)
c=c.replace('.hero{display:grid;grid-template-columns:1fr 1fr;background:var(--primary);min-height:640px}', '.hero{position:relative;isolation:isolate;display:flex;align-items:center;min-height:100vh;min-height:100svh;overflow:hidden;background:var(--primary)}')
c=c.replace('.hero-copy{padding:65px 10% 44px 12%;color:#e0dcea;display:flex;flex-direction:column;justify-content:center}', '.hero-copy{position:relative;z-index:2;width:100%;padding:80px 6% 90px;color:var(--white);display:flex;flex-direction:column;justify-content:center}.hero-copy>h1,.hero-copy>.actions,.hero-copy>.hero-note{max-width:680px}.hero-media,.hero-overlay{position:absolute;inset:0;pointer-events:none}.hero-media{z-index:0}.hero-poster,.hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}.hero-video{opacity:0}.hero-video.is-playing{opacity:1}.hero-overlay{z-index:1;background:linear-gradient(90deg,rgba(10,6,40,.86) 0%,rgba(10,6,40,.65) 45%,rgba(10,6,40,.22) 100%),linear-gradient(0deg,rgba(10,6,40,.42),transparent 55%)}.hero-video-toggle{position:absolute;z-index:3;right:6%;bottom:24px;display:flex;align-items:center;gap:12px;min-height:44px;padding:10px 15px;border:1px solid #ffffff80;border-radius:3px;background:#0d074580;color:var(--white);font-size:11px}.hero-video-toggle:hover{background:var(--primary)}')
c=re.sub(r'\.hero-image\{[^}]*\}|\.hero-image>img\{[^}]*\}|\.image-caption\{[^}]*\}|\.photo-note\{[^}]*\}','',c)
c=c.replace('.hero{min-height:730px}','').replace('.hero,.hero-image{min-height:610px}','')
c=c.replace('.hero-copy{padding-left:max(12%,calc((100vw - 1320px)))}','.hero-copy{padding-left:max(6%,calc((100vw - 1320px)/2))}')
c=c.replace('.hero{grid-template-columns:1fr}', '.hero-overlay{background:linear-gradient(90deg,rgba(10,6,40,.8),rgba(10,6,40,.55)),linear-gradient(0deg,rgba(10,6,40,.4),transparent)}')
c=c.replace('.hero-copy{padding:44px 7% 34px}', '.hero-copy{padding:54px 7% 92px}')
c=c.replace('.hero-note{border-top:1px solid #39315e;', '.hero-note{border-top:1px solid #ffffff40;')
c=c.replace('@media(prefers-reduced-motion:reduce){html', '@media(prefers-reduced-motion:reduce){.hero-video,.hero-video-toggle{display:none!important}html')
j+='''
// Decorative hero video: defer loading entirely for reduced-motion visitors.
(() => {
  const video = document.querySelector('.hero-video');
  const toggle = document.querySelector('.hero-video-toggle');
  if (!video || !toggle) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false;
  let failed = false;
  function updateButton() {
    toggle.setAttribute('aria-pressed', String(video.paused));
    toggle.setAttribute('aria-label', video.paused ? 'Putar video latar' : 'Jeda video latar');
    toggle.textContent = video.paused ? 'Putar video ▷' : 'Jeda video Ⅱ';
  }
  function syncVideo() {
    if (reduced.matches || document.hidden || userPaused || failed) {
      video.pause();
      if (reduced.matches || failed) video.classList.remove('is-playing');
      toggle.hidden = reduced.matches || failed;
      updateButton();
      return;
    }
    video.muted = true;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    toggle.hidden = false;
    const play = video.play();
    if (play) play.catch(() => { updateButton(); });
  }
  video.addEventListener('playing', () => {
    if (reduced.matches) { video.pause(); return; }
    video.classList.add('is-playing');
    updateButton();
  });
  video.addEventListener('pause', updateButton);
  video.addEventListener('error', () => { failed = true; syncVideo(); });
  toggle.addEventListener('click', () => { userPaused = !video.paused; syncVideo(); });
  reduced.addEventListener('change', syncVideo);
  document.addEventListener('visibilitychange', syncVideo);
  syncVideo();
})();
'''
for f,data in [('index.html',h),('css/style.css',c),('js/script.js',j)]:
 (root/f).write_text(data,encoding='utf-8')
print('Updated only index.html, css/style.css, js/script.js in matching Bleum project.')
