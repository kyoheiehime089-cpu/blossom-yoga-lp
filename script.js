document.addEventListener('DOMContentLoaded', () => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const prevButton = document.getElementById('prevSlide');
  const nextButton = document.getElementById('nextSlide');
  const counter = document.getElementById('slideCounter');
  const dotsContainer = document.getElementById('progressDots');

  if (!slides.length || !prevButton || !nextButton || !counter || !dotsContainer) return;

  let activeIndex = 0;

  const scrollToSlide = (index) => {
    const safeIndex = Math.min(Math.max(index, 0), slides.length - 1);
    slides[safeIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateNavigation = (index) => {
    activeIndex = index;
    counter.textContent = `${index + 1} / ${slides.length}`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === slides.length - 1;
    dotsContainer.querySelectorAll('.progress-dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
      dot.setAttribute('aria-current', dotIndex === index ? 'step' : 'false');
    });
  };

  slides.forEach((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'progress-dot';
    dot.setAttribute('aria-label', `${index + 1}枚目：${slide.dataset.title || 'スライド'}へ移動`);
    dot.addEventListener('click', () => scrollToSlide(index));
    dotsContainer.appendChild(dot);
  });

  const observer = new IntersectionObserver((entries) => {
    const visibleSlide = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visibleSlide) return;
    updateNavigation(slides.indexOf(visibleSlide.target));
  }, { threshold: [0.35, 0.55, 0.75] });

  slides.forEach((slide) => observer.observe(slide));

  prevButton.addEventListener('click', () => scrollToSlide(activeIndex - 1));
  nextButton.addEventListener('click', () => scrollToSlide(activeIndex + 1));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      scrollToSlide(activeIndex - 1);
    }

    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      scrollToSlide(activeIndex + 1);
    }
  });

  updateNavigation(0);
});
