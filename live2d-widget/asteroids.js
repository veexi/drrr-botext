(function(){
  function Asteroids(){
    const instance = this;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const overlay = document.createElement('div');
    const scoreLabel = document.createElement('div');
    const help = document.createElement('div');
    const close = document.createElement('button');
    const keys = new Set();
    const bullets = [];
    const rocks = [];
    const player = { x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0, invulnerable: 2 };
    let score = 0;
    let lives = 3;
    let lastShot = 0;
    let previous = 0;
    let frame = 0;
    let stopped = false;

    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(2,8,18,.88);display:grid;place-items:center;';
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    scoreLabel.style.cssText = 'position:absolute;top:18px;left:22px;color:#bfeaff;font:16px monospace;text-shadow:0 0 8px #26c6da;';
    help.style.cssText = 'position:absolute;bottom:18px;left:22px;color:#d9e8f2;font:13px monospace;';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close Asteroids');
    close.style.cssText = 'position:absolute;right:18px;top:12px;border:0;background:transparent;color:white;font:32px sans-serif;cursor:pointer;';
    help.textContent = '← → rotate   ↑ thrust   Space shoot   Esc close';
    overlay.append(canvas, scoreLabel, help, close);
    document.documentElement.appendChild(overlay);

    function resize(){
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      player.x = player.x || window.innerWidth / 2;
      player.y = player.y || window.innerHeight / 2;
    }

    function wrap(object){
      if(object.x < 0) object.x += window.innerWidth;
      if(object.x > window.innerWidth) object.x -= window.innerWidth;
      if(object.y < 0) object.y += window.innerHeight;
      if(object.y > window.innerHeight) object.y -= window.innerHeight;
    }

    function makeRock(x, y, radius){
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 65;
      const points = 8 + Math.floor(Math.random() * 5);
      const shape = Array.from({length: points}, () => .72 + Math.random() * .48);
      return { x, y, radius, angle: 0, spin: (Math.random() - .5) * 1.4,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, shape };
    }

    function addWave(){
      for(let i = 0; i < 5 + Math.min(rocks.length, 7); i++){
        const edge = Math.floor(Math.random() * 4);
        const x = edge < 2 ? Math.random() * window.innerWidth : (edge === 2 ? 0 : window.innerWidth);
        const y = edge < 2 ? (edge === 0 ? 0 : window.innerHeight) : Math.random() * window.innerHeight;
        rocks.push(makeRock(x, y, 24 + Math.random() * 16));
      }
    }

    function keydown(event){
      if(event.key === 'Escape') return destroy();
      if(['ArrowLeft','ArrowRight','ArrowUp',' ','a','d','w','A','D','W'].includes(event.key)){
        event.preventDefault();
        keys.add(event.key.toLowerCase());
      }
    }
    function keyup(event){ keys.delete(event.key.toLowerCase()); }
    function shoot(now){
      if(!keys.has(' ') || now - lastShot < 180) return;
      lastShot = now;
      bullets.push({
        x: player.x + Math.cos(player.angle) * 18,
        y: player.y + Math.sin(player.angle) * 18,
        vx: player.vx + Math.cos(player.angle) * 390,
        vy: player.vy + Math.sin(player.angle) * 390,
        life: 1.1,
      });
    }

    function drawRock(rock){
      context.save();
      context.translate(rock.x, rock.y);
      context.rotate(rock.angle);
      context.beginPath();
      rock.shape.forEach((scale, index) => {
        const angle = index / rock.shape.length * Math.PI * 2;
        const x = Math.cos(angle) * rock.radius * scale;
        const y = Math.sin(angle) * rock.radius * scale;
        if(index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath();
      context.strokeStyle = '#d1edf7';
      context.lineWidth = 1.5;
      context.shadowColor = '#4dd0e1';
      context.shadowBlur = 9;
      context.stroke();
      context.restore();
    }

    function draw(now, elapsed){
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.fillStyle = '#fff';
      for(let i = 0; i < 55; i++){
        const x = (i * 173 + 29) % window.innerWidth;
        const y = (i * 97 + 43) % window.innerHeight;
        context.globalAlpha = .25 + (i % 4) * .15;
        context.fillRect(x, y, 1.5, 1.5);
      }
      context.globalAlpha = 1;

      if(keys.has('arrowleft') || keys.has('a')) player.angle -= 3.8 * elapsed;
      if(keys.has('arrowright') || keys.has('d')) player.angle += 3.8 * elapsed;
      if(keys.has('arrowup') || keys.has('w')){
        player.vx += Math.cos(player.angle) * 175 * elapsed;
        player.vy += Math.sin(player.angle) * 175 * elapsed;
      }
      player.vx *= Math.pow(.992, elapsed * 60);
      player.vy *= Math.pow(.992, elapsed * 60);
      player.x += player.vx * elapsed;
      player.y += player.vy * elapsed;
      player.invulnerable = Math.max(0, player.invulnerable - elapsed);
      wrap(player);
      shoot(now);

      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.angle);
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-12, -10);
      context.lineTo(-7, 0);
      context.lineTo(-12, 10);
      context.closePath();
      context.strokeStyle = player.invulnerable > 0 && Math.floor(now / 100) % 2 ? '#607d8b' : '#fff';
      context.lineWidth = 2;
      context.stroke();
      if(keys.has('arrowup') || keys.has('w')){
        context.beginPath(); context.moveTo(-10, -5); context.lineTo(-22 - Math.random() * 9, 0); context.lineTo(-10, 5);
        context.strokeStyle = '#ffb74d'; context.stroke();
      }
      context.restore();

      for(let i = bullets.length - 1; i >= 0; i--){
        const bullet = bullets[i];
        bullet.x += bullet.vx * elapsed; bullet.y += bullet.vy * elapsed; bullet.life -= elapsed;
        wrap(bullet);
        context.fillStyle = '#fff59d'; context.beginPath(); context.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2); context.fill();
        if(bullet.life <= 0) bullets.splice(i, 1);
      }

      for(const rock of rocks){
        rock.x += rock.vx * elapsed; rock.y += rock.vy * elapsed; rock.angle += rock.spin * elapsed;
        wrap(rock); drawRock(rock);
      }

      for(let r = rocks.length - 1; r >= 0; r--){
        const rock = rocks[r];
        const hit = bullets.findIndex(bullet => Math.hypot(bullet.x - rock.x, bullet.y - rock.y) < rock.radius);
        if(hit >= 0){
          bullets.splice(hit, 1); rocks.splice(r, 1); score += Math.round(rock.radius);
          if(rock.radius > 15){
            rocks.push(makeRock(rock.x, rock.y, rock.radius * .55));
            rocks.push(makeRock(rock.x, rock.y, rock.radius * .55));
          }
          continue;
        }
        if(player.invulnerable === 0 && Math.hypot(player.x - rock.x, player.y - rock.y) < rock.radius + 11){
          lives--; player.invulnerable = 2.5; player.x = window.innerWidth / 2; player.y = window.innerHeight / 2; player.vx = player.vy = 0;
          if(lives <= 0){ lives = 3; score = 0; rocks.length = 0; }
        }
      }
      if(!rocks.length) addWave();
      scoreLabel.textContent = `SCORE ${score}   SHIPS ${lives}`;
      frame = requestAnimationFrame(tick);
    }

    function tick(now){
      if(stopped) return;
      const elapsed = Math.min((now - (previous || now)) / 1000, .04);
      previous = now;
      draw(now, elapsed);
    }

    function destroy(){
      if(stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('resize', resize);
      overlay.remove();
      if(window.ASTEROIDSPLAYERS){
        const index = window.ASTEROIDSPLAYERS.indexOf(instance);
        if(index >= 0) window.ASTEROIDSPLAYERS.splice(index, 1);
      }
    }

    this.destroy = destroy;
    close.addEventListener('click', destroy);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('resize', resize);
    resize();
    addWave();
    frame = requestAnimationFrame(tick);
  }

  window.Asteroids = Asteroids;
  if(!window.ASTEROIDSPLAYERS) window.ASTEROIDSPLAYERS = [];
})();
