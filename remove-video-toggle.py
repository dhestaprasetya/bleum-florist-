from pathlib import Path
import re
r=Path(r'D:\Dhesta\Project\bleumflowers_bandung\bleum-flowers')
p=r/'index.html';s=p.read_text(encoding='utf-8');s=re.sub(r'\s*<button class="hero-video-toggle".*?</button>','',s);p.write_text(s,encoding='utf-8')
p=r/'css/style.css';s=p.read_text(encoding='utf-8');s=re.sub(r'\.hero-video-toggle(?:\:hover)?\{[^}]*\}','',s);s=s.replace('.hero-video,.hero-video-toggle{','.hero-video{');p.write_text(s,encoding='utf-8')
p=r/'js/script.js';s=p.read_text(encoding='utf-8');s=s.replace("  const toggle = document.querySelector('.hero-video-toggle');\n  if (!video || !toggle) return;","  if (!video) return;");s=s.replace('  let userPaused = false;\n','');s=re.sub(r'  function updateButton\(\) \{.*?\n  \}\n','',s,flags=re.S);s=s.replace(' || userPaused','');s=re.sub(r'^    .*toggle\.hidden.*\n','',s,flags=re.M);s=re.sub(r'^\s*updateButton\(\);\n','\n',s,flags=re.M);s=s.replace('if (play) play.catch(() => { updateButton(); });',"if (play) play.catch(() => { video.classList.remove('is-playing'); });");s=s.replace("  video.addEventListener('pause', updateButton);\n",'');s=re.sub(r'^  toggle\.addEventListener.*\n','',s,flags=re.M);p.write_text(s,encoding='utf-8')
print('Removed pause button and its CSS/JS dependencies.')
