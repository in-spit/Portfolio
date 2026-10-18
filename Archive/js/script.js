const projectWeb = document.querySelector('.project-web');
const webToggle = document.querySelector('.web-toggle');
const designToggle = document.querySelector('.design-toggle');
const designList = document.querySelector('.design-list');
const projectNodes = document.querySelectorAll('.project-node');
const modal = document.querySelector('.project-modal');
const modalTag = document.getElementById('modal-tag');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const modalClose = document.querySelector('.modal-close');

const applyScrollMotion = () => {
    const scrollOffset = window.scrollY * -0.7;

    if (designToggle) {
        designToggle.style.setProperty('--float-shift', `${scrollOffset}px`);
    }

    if (designList) {
        designList.style.setProperty('--float-shift', `${scrollOffset}px`);
    }
};

window.addEventListener('scroll', applyScrollMotion, { passive: true });
applyScrollMotion();

if (projectWeb && webToggle) {
    webToggle.addEventListener('click', () => {
        const isOpen = projectWeb.classList.toggle('is-open');
        webToggle.setAttribute('aria-expanded', String(isOpen));
        webToggle.textContent = isOpen ? 'close' : 'projects';
        webToggle.setAttribute('aria-label', isOpen ? 'Close projects web' : 'Open projects web');
    });
}

if (designToggle && designList) {
    designToggle.addEventListener('click', () => {
        const isOpen = designList.classList.toggle('is-open');
        designToggle.setAttribute('aria-expanded', String(isOpen));
        designToggle.textContent = isOpen ? 'close' : 'web';
        designToggle.setAttribute('aria-label', isOpen ? 'Close web design list' : 'Open web design list');
    });
}

projectNodes.forEach((node) => {
    node.addEventListener('click', () => {
        const title = node.dataset.title || 'Project';
        const tag = node.dataset.tag || 'project';
        const text = node.dataset.text || 'More details coming soon.';
        const downloadUrl = node.dataset.downloadUrl;

        modalTag.textContent = tag;
        modalTitle.textContent = title;

        if (downloadUrl) {
            modalText.innerHTML = `${text} <a href="${downloadUrl}" download>download</a>`;
        } else {
            modalText.textContent = text;
        }

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    });
});

if (modalClose) {
    modalClose.addEventListener('click', () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    });
}

if (modal) {
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
    });
}
