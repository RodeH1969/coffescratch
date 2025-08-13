const canvas = document.getElementById('scratchCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const container = document.querySelector('.scratch-container');

let isScratching = false;
let scratchedPercentage = 0;
let tokenData = null;

// Extract token from URL
function getToken() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('token');
}

// Fetch token info
async function fetchTokenData(token) {
  const res = await fetch(`/api/token/${token}`);
  if (!res.ok) {
    document.getElementById('prizeMessage').textContent = "❌ Invalid or missing token.";
    throw new Error("Token not found");
  }
  return await res.json();
}

// Render result and QR code (if winner)
function renderPrize(result, token) {
  const msg = document.getElementById('prizeMessage');
  const img = document.getElementById('prizeImage');
  const amount = document.getElementById('prizeAmount');
  const status = document.getElementById('prizeStatus');
  const code = document.getElementById('uniqueCode');

  if (result === "win") {
    msg.textContent = "🎉🎊🎈 CONGRATULATIONS! 🎈🎊🎉";
    img.src = "./assets/coffee cup.png";
    img.style.display = "block";
    amount.textContent = "You've won a FREE coffee!";
    status.textContent = "Show this at the café!";
    code.innerHTML = `
      <div style="font-size: 10px;">Your Code:<br/><strong>${token}</strong></div>
      <canvas id="qrCanvas" width="70" height="70"></canvas>
    `;
    new QRious({
      element: document.getElementById('qrCanvas'),
      value: `${window.location.origin}/verify?token=${token}`,
      size: 70,
    });
  } else {
    msg.textContent = "😔 OH SHUCKS!";
    img.src = "./assets/coffee beans.png";
    img.style.display = "block";
    amount.textContent = "Not a winner this time.";
    status.textContent = "Come back tomorrow!";
    code.innerHTML = ""; // Do not show code or QR for losers
  }
}

// Scratchable surface
function drawScratchSurface() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#c0c0c0');
  gradient.addColorStop(0.3, '#e6e6e6');
  gradient.addColorStop(0.7, '#a0a0a0');
  gradient.addColorStop(1, '#808080');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < canvas.width; i += 20) {
    for (let j = 0; j < canvas.height; j += 20) {
      if ((i + j) % 40 === 0) {
        ctx.fillRect(i, j, 10, 10);
      }
    }
  }
}

// Get pointer/touch position
function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: x - rect.left,
    y: y - rect.top
  };
}

// Scratch interaction
function scratch(e) {
  if (!isScratching) return;
  const pos = getEventPos(e);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
  ctx.fill();
  calculateScratchPercentage();
}

// When 60% scratched, reveal prize + mark as used
function calculateScratchPercentage() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  let transparent = 0;

  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 0) transparent++;
  }

  scratchedPercentage = (transparent / (pixels.length / 4)) * 100;

  if (scratchedPercentage > 60) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    fetch(`/api/token/${tokenData.token}/use`, { method: 'POST' });
  }
}

// Resize canvas to container
function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  drawScratchSurface();
}

// Init flow
(async function () {
  try {
    const token = getToken();
    tokenData = await fetchTokenData(token);
    renderPrize(tokenData.result, tokenData.token);
    resizeCanvas();
  } catch (err) {
    console.error(err);
  }
})();

// Event listeners
canvas.addEventListener('mousedown', e => { isScratching = true; scratch(e); });
canvas.addEventListener('mousemove', scratch);
canvas.addEventListener('mouseup', () => { isScratching = false; });

canvas.addEventListener('touchstart', e => { e.preventDefault(); isScratching = true; scratch(e); }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); scratch(e); }, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); isScratching = false; }, { passive: false });

window.addEventListener('resize', resizeCanvas);
