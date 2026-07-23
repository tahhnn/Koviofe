class StepTour {
  constructor(options = {}) {
    this.steps = options.steps || [];
    this.currentStep = 0;
    this.onComplete = options.onComplete || (() => { });
    this.onSkip = options.onSkip || (() => { });
    this.onNext = options.onNext || (() => { });
    this.onPrev = options.onPrev || (() => { });
    this.onEnd = options.onEnd || (() => { });

    this.overlay = null;
    this.tooltip = null;
    this.highlightBox = null;
    this._ended = false;
    this._onKeyDown = null;

    this.config = {
      overlayColor: options.overlayColor || 'rgba(0, 0, 0, 0.75)',
      highlightColor: options.highlightColor || '#fff',
      highlightPadding: options.highlightPadding || 10,
      tooltipOffset: options.tooltipOffset || 10,
      showSkipButton: options.showSkipButton !== false,
      showProgress: options.showProgress !== false,
      scrollBehavior: options.scrollBehavior || 'smooth',
      animation: options.animation !== false,
      finishLabel: options.finishLabel || 'Finish',
      nextLabel: options.nextLabel || 'Next',
      prevLabel: options.prevLabel || 'Back',
      skipLabel: options.skipLabel || 'Skip',
    };
  }

  /** Keep only steps whose targets exist in the DOM right now. */
  _resolveAvailableSteps(steps) {
    return (steps || []).filter((step) => {
      if (!step || !step.element) return false;
      try {
        return !!document.querySelector(step.element);
      } catch {
        return false;
      }
    });
  }

  start() {
    if (this.steps.length === 0) {
      console.warn('No steps defined for the tour');
      return;
    }

    this.steps = this._resolveAvailableSteps(this.steps);
    if (this.steps.length === 0) {
      console.warn('No tour targets found in the DOM');
      this.onComplete();
      this.onEnd();
      return;
    }

    this._ended = false;
    this.currentStep = 0;
    this._savedScroll = { x: window.scrollX, y: window.scrollY };
    this.createOverlay();
    this._bindKeys();
    this.showStep(this.currentStep);
  }

  _bindKeys() {
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.skip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindKeys() {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'step-tour-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9998;
      transition: opacity 0.3s ease;
      opacity: 0;
      pointer-events: auto;
    `;

    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'step-tour-highlight';
    this.highlightBox.style.cssText = `
      position: fixed;
      border: 2px solid #fff;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px ${this.config.overlayColor};
      z-index: 9999;
      transition: all 0.3s ease;
      pointer-events: none;
    `;

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'step-tour-tooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      max-width: min(400px, calc(100vw - 24px));
      opacity: 0;
      transform: scale(0.9);
      transition: all 0.3s ease;
      pointer-events: auto;
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.tooltip);

    setTimeout(() => {
      if (this.overlay) this.overlay.style.opacity = '1';
    }, 10);
  }

  showStep(stepIndex) {
    if (this._ended) return;
    if (stepIndex < 0 || stepIndex >= this.steps.length) return;

    const step = this.steps[stepIndex];
    const element = document.querySelector(step.element);

    // Target disappeared mid-tour — jump to next/prev available step or finish
    if (!element) {
      console.warn(`Element ${step.element} not found, skipping`);
      const nextIdx = this._findAvailableIndex(stepIndex + 1, 1);
      if (nextIdx !== -1) {
        this.currentStep = nextIdx;
        this.showStep(nextIdx);
        return;
      }
      const prevIdx = this._findAvailableIndex(stepIndex - 1, -1);
      if (prevIdx !== -1) {
        this.currentStep = prevIdx;
        this.showStep(prevIdx);
        return;
      }
      this.complete();
      return;
    }

    this.currentStep = stepIndex;

    element.scrollIntoView({
      behavior: this.config.scrollBehavior,
      block: 'nearest',
    });

    setTimeout(() => {
      if (this._ended) return;
      const el = document.querySelector(step.element);
      if (!el) {
        this.showStep(stepIndex);
        return;
      }
      this.highlightElement(el);
      this.showTooltip(el, step);
    }, 300);
  }

  _findAvailableIndex(from, direction) {
    let i = from;
    while (i >= 0 && i < this.steps.length) {
      try {
        if (document.querySelector(this.steps[i].element)) return i;
      } catch { /* ignore invalid selector */ }
      i += direction;
    }
    return -1;
  }

  highlightElement(element) {
    if (!this.highlightBox) return;
    const rect = element.getBoundingClientRect();
    const padding = this.config.highlightPadding;

    this.highlightBox.style.top = `${rect.top - padding}px`;
    this.highlightBox.style.left = `${rect.left - padding}px`;
    this.highlightBox.style.width = `${rect.width + padding * 2}px`;
    this.highlightBox.style.height = `${rect.height + padding * 2}px`;
    this.highlightBox.style.opacity = '1';
  }

  showTooltip(element, step) {
    if (!this.tooltip) return;
    const rect = element.getBoundingClientRect();
    const position = step.position || 'bottom';
    const isLast = this.currentStep >= this.steps.length - 1;

    this.tooltip.innerHTML = `
      <div class="step-tour-content">
        ${this.config.showProgress ? `
          <div style="
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
            font-weight: 500;
          ">
            Step ${this.currentStep + 1} / ${this.steps.length}
          </div>
        ` : ''}

        ${step.title ? `
          <h3 style="
            margin: 0 0 10px 0;
            font-size: 18px;
            color: #333;
          ">${step.title}</h3>
        ` : ''}

        <p style="
          margin: 0 0 20px 0;
          color: #666;
          line-height: 1.5;
        ">${step.content}</p>

        <div style="
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
        ">
          ${this.config.showSkipButton ? `
            <button type="button" class="step-tour-skip" style="
              padding: 8px 16px;
              background: transparent;
              border: 1px solid #ddd;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              color: #666;
            ">${this.config.skipLabel}</button>
          ` : ''}

          ${this.currentStep > 0 ? `
            <button type="button" class="step-tour-prev" style="
              padding: 8px 16px;
              background: #f0f0f0;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              color: #333;
            ">${this.config.prevLabel}</button>
          ` : ''}

          <button type="button" class="step-tour-next" style="
            padding: 8px 16px;
            background: ${isLast ? '#16a34a' : '#e85d4c'};
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            color: white;
            font-weight: 600;
          ">${isLast ? this.config.finishLabel : this.config.nextLabel}</button>
        </div>
      </div>
    `;

    // Measure after paint so size is accurate
    this.tooltip.style.opacity = '0';
    this.tooltip.style.transform = 'scale(0.9)';
    requestAnimationFrame(() => {
      if (this._ended || !this.tooltip) return;
      this.positionTooltip(rect, position);
      this.attachTooltipEvents();
      this.tooltip.style.opacity = '1';
      this.tooltip.style.transform = 'scale(1)';
    });
  }

  positionTooltip(rect, position) {
    if (!this.tooltip) return;
    const offset = this.config.tooltipOffset;
    const tooltipRect = this.tooltip.getBoundingClientRect();

    let top;
    let left;

    switch (position) {
      case 'top':
        top = rect.top - tooltipRect.height - offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.left - tooltipRect.width - offset;
        break;
      case 'right':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.right + offset;
        break;
      default:
        top = rect.bottom + offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
    }

    const maxLeft = window.innerWidth - tooltipRect.width - 10;
    const maxTop = window.innerHeight - tooltipRect.height - 10;

    left = Math.max(10, Math.min(left, maxLeft));
    top = Math.max(10, Math.min(top, maxTop));

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }

  attachTooltipEvents() {
    if (!this.tooltip) return;
    const nextBtn = this.tooltip.querySelector('.step-tour-next');
    const prevBtn = this.tooltip.querySelector('.step-tour-prev');
    const skipBtn = this.tooltip.querySelector('.step-tour-skip');

    if (nextBtn) nextBtn.onclick = () => this.next();
    if (prevBtn) prevBtn.onclick = () => this.prev();
    if (skipBtn) skipBtn.onclick = () => this.skip();
  }

  next() {
    if (this._ended) return;
    if (this.currentStep < this.steps.length - 1) {
      const nextIdx = this._findAvailableIndex(this.currentStep + 1, 1);
      if (nextIdx === -1) {
        this.complete();
        return;
      }
      this.currentStep = nextIdx;
      this.onNext(this.currentStep);
      if (this.tooltip) {
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transform = 'scale(0.9)';
      }
      setTimeout(() => this.showStep(this.currentStep), 200);
    } else {
      this.complete();
    }
  }

  prev() {
    if (this._ended) return;
    if (this.currentStep > 0) {
      const prevIdx = this._findAvailableIndex(this.currentStep - 1, -1);
      if (prevIdx === -1) return;
      this.currentStep = prevIdx;
      this.onPrev(this.currentStep);
      if (this.tooltip) {
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transform = 'scale(0.9)';
      }
      setTimeout(() => this.showStep(this.currentStep), 200);
    }
  }

  skip() {
    if (this._ended) return;
    this.onSkip();
    this.end();
  }

  complete() {
    if (this._ended) return;
    this.onComplete();
    this.end();
  }

  end() {
    if (this._ended) return;
    this._ended = true;
    this._unbindKeys();

    if (this.overlay) this.overlay.style.opacity = '0';
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
      this.tooltip.style.transform = 'scale(0.9)';
    }
    if (this.highlightBox) this.highlightBox.style.opacity = '0';

    setTimeout(() => {
      if (this.overlay) this.overlay.remove();
      if (this.tooltip) this.tooltip.remove();
      if (this.highlightBox) this.highlightBox.remove();

      this.overlay = null;
      this.tooltip = null;
      this.highlightBox = null;

      if (this._savedScroll) {
        window.scrollTo({
          top: this._savedScroll.y,
          left: this._savedScroll.x,
          behavior: 'auto',
        });
        this._savedScroll = null;
      }

      try {
        this.onEnd();
      } catch (e) {
        console.error(e);
      }
    }, 300);
  }

  addSteps(steps) {
    this.steps = [...this.steps, ...steps];
  }

  reset() {
    this.currentStep = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StepTour;
}

if (typeof window !== 'undefined') {
  window.StepTour = StepTour;
  StepTour.__kovioV2 = true;
}
