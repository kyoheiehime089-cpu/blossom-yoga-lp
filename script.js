document.addEventListener('DOMContentLoaded', () => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const prevButton = document.getElementById('prevSlide');
  const nextButton = document.getElementById('nextSlide');
  const counter = document.getElementById('slideCounter');
  const dotsContainer = document.getElementById('progressDots');
  const header = document.querySelector('.deck-header');

  if (!slides.length || !prevButton || !nextButton || !counter || !dotsContainer) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeIndex = 0;

  const setHeaderHeight = () => {
    if (!header) return;
    document.documentElement.style.setProperty('--deck-header-height', `${header.offsetHeight}px`);
  };

  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);

  slides.forEach((slide, index) => {
    const number = slide.querySelector('.slide-no');
    if (number) number.textContent = String(index + 1).padStart(2, '0');
  });

  const scrollToSlide = (index) => {
    const safeIndex = Math.min(Math.max(index, 0), slides.length - 1);
    const target = slides[safeIndex];
    const useDeckScroll = window.matchMedia('(max-width: 900px)').matches;

    if (useDeckScroll) {
      deck.scrollTo({
        top: target.offsetTop - deck.offsetTop,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
      return;
    }

    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
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
  }, { root: window.matchMedia('(max-width: 900px)').matches ? deck : null, threshold: [0.35, 0.55, 0.75] });

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

    if (event.key === 'Home') {
      event.preventDefault();
      scrollToSlide(0);
    }

    if (event.key === 'End') {
      event.preventDefault();
      scrollToSlide(slides.length - 1);
    }
  });

  updateNavigation(0);
});
