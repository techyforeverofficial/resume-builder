import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentResumeData = null;
    let pendingPaymentPrompt = false;
    let isSignUpMode = false;

    window.openLoginModal = () => {
        isSignUpMode = false;
        updateAuthModalUI();
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('active');
    };

    window.openSignupModal = () => {
        isSignUpMode = true;
        updateAuthModalUI();
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('active');
    };

    function updateAuthModalUI() {
        const authTitle = document.getElementById('auth-title');
        const authSubtitle = document.getElementById('auth-subtitle');
        const authToggleText = document.getElementById('auth-toggle-text');
        const authToggleBtn = document.getElementById('auth-toggle-btn');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const authErrorMsg = document.getElementById('auth-error-msg');
        
        if (isSignUpMode) {
            if (authTitle) authTitle.innerText = 'Create Account';
            if (authSubtitle) authSubtitle.innerText = 'Sign up to start saving resumes';
            if (authToggleText) authToggleText.innerText = 'Already have an account?';
            if (authToggleBtn) authToggleBtn.innerText = 'Login';
            if (authSubmitBtn) authSubmitBtn.innerText = 'Sign Up';
        } else {
            if (authTitle) authTitle.innerText = 'Welcome Back';
            if (authSubtitle) authSubtitle.innerText = 'Login to save your resume';
            if (authToggleText) authToggleText.innerText = 'Don\'t have an account?';
            if (authToggleBtn) authToggleBtn.innerText = 'Sign Up';
            if (authSubmitBtn) authSubmitBtn.innerText = 'Login';
        }
        if (authErrorMsg) authErrorMsg.style.display = 'none';
    }

    // --- Real Firebase Auth & Profile Dropdown ---
    const dropdown = document.getElementById("dropdownMenu");
    const profileBtn = document.getElementById("profileBtn");

    if (dropdown) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                dropdown.innerHTML = `
                    <div class="dropdown-item" id="myResumes">My Resumes</div>
                    <div class="dropdown-item" id="logout">Logout</div>
                `;

                document.getElementById("logout").onclick = () => {
                    signOut(auth);
                };

                document.getElementById("myResumes").onclick = () => {
                    window.location.href = "/my-resumes.html";
                };
            } else {
                dropdown.innerHTML = `
                    <div class="dropdown-item" id="signin">Sign In</div>
                    <div class="dropdown-item" id="signup">Sign Up</div>
                `;

                document.getElementById("signin").onclick = () => {
                    dropdown.classList.add("hidden");
                    window.openLoginModal();
                };

                document.getElementById("signup").onclick = () => {
                    dropdown.classList.add("hidden");
                    window.openSignupModal();
                };
            }
        });
    }

    if (profileBtn && dropdown) {
        profileBtn.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
        };
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add("hidden");
            }
        });
    }

    // --- Navigation ---
    const views = {
        home: document.getElementById('home-view'),
        form: document.getElementById('form-view'),
        preview: document.getElementById('preview-view'),
        about: document.getElementById('about-view'),
        contact: document.getElementById('contact-view'),
        privacy: document.getElementById('privacy-view')
    };

    const navLinks = {
        about: document.getElementById('link-about'),
        contact: document.getElementById('link-contact'),
        privacy: document.getElementById('link-privacy-footer')
    };

    const navigateTo = (viewName) => {
        // Hide all views
        Object.values(views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        // Show target view
        if (views[viewName]) {
            views[viewName].classList.add('active');
        }

        // Update nav links active state
        Object.values(navLinks).forEach(l => {
            if (l) l.classList.remove('active');
        });
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        } else if (viewName === 'form' || viewName === 'preview') {
            // keep home highlighted or remove all, let's remove all for form/preview 
        }

        window.scrollTo(0, 0);
    };

    // --- Step Navigation Logic ---
    let currentStep = 1;
    const totalSteps = 7;

    const showStep = (stepNumber) => {
        for (let i = 1; i <= totalSteps; i++) {
            const stepContent = document.getElementById(`step-${i}`);
            const navItem = document.getElementById(`nav-step-${i}`);

            if (stepContent) {
                if (i === stepNumber) {
                    stepContent.classList.remove('step-hidden');
                } else {
                    stepContent.classList.add('step-hidden');
                }
            }

            if (navItem) {
                if (i === stepNumber) {
                    navItem.classList.add('step-active');
                } else {
                    navItem.classList.remove('step-active');
                }
            }
        }
        currentStep = stepNumber;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep === 1 && !selectedTemplate) {
                alert("Please select a template to continue");
                return;
            }
            if (currentStep < totalSteps) showStep(currentStep + 1);
        });
    });

    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 1) showStep(currentStep - 1);
        });
    });

    let selectedTemplate = null;
    const photoContainer = document.getElementById('photo-upload-container');
    const templateContainer = document.getElementById('template-selector-container');

    const templatesList = [
        { id: "modern", name: "Template 1" },
        { id: "classic", name: "Template 2" },
        { id: "creative", name: "Template 3" },
        { id: "professional", name: "Template 4" }
    ];

    const basePath = "templates/";
    const formats = ["webp", "png", "jpg", "jpeg"];

    function setPreviewImage(template, imgElement, placeholderElement) {
        console.log("Checking template:", template.id, template.name);
        let index = 0;

        const rawName = template.name;
        const nameLowerSpaces = template.name.toLowerCase();
        const nameWithoutSpaces = template.name.replace(/\\s+/g, '');
        const nameLowerNoSpaces = template.name.toLowerCase().replace(/\\s+/g, '');

        const namesToTry = [
            template.id,
            template.id.toLowerCase(),
            rawName,
            nameLowerSpaces,
            nameWithoutSpaces,
            nameLowerNoSpaces
        ];
        const uniqueNames = [...new Set(namesToTry)];

        const pathsToTry = [];
        uniqueNames.forEach(name => {
            formats.forEach(f => {
                pathsToTry.push(`${basePath}${name}.${f}`);
            });
        });

        function tryNext() {
            if (index >= pathsToTry.length) {
                if (imgElement) {
                    imgElement.style.display = 'none';
                    imgElement.src = "";
                    imgElement.alt = "Preview not available";
                }
                if (placeholderElement) {
                    placeholderElement.style.display = 'flex';
                    placeholderElement.innerText = "Preview not available";
                }
                return;
            }

            const path = pathsToTry[index];
            const testImg = new Image();

            testImg.onload = () => {
                if (imgElement) {
                    imgElement.src = path;
                    imgElement.style.display = 'block';
                }
                if (placeholderElement) placeholderElement.style.display = 'none';

                template.resolvedPreview = path;
            };

            testImg.onerror = () => {
                index++;
                tryNext();
            };

            testImg.src = path;
        }

        tryNext();
    }

    if (templateContainer) {
        templateContainer.innerHTML = templatesList.map(t => {
            return `
                <label class="template-option">
                    <input type="radio" name="template" value="${t.id}">
                    <div class="template-card ${t.id}-card">
                        <div class="template-preview">
                            <img id="img-prev-${t.id}" alt="${t.name}" style="display:none; width:100%; height:100%; object-fit:cover;">
                            <div id="placeholder-prev-${t.id}" class="template-placeholder" style="display:flex;">Loading...</div>
                        </div>
                        <span class="template-name">${t.name}</span>
                    </div>
                </label>
            `;
        }).join('');

        templatesList.forEach(t => {
            const imgEl = document.getElementById(`img-prev-${t.id}`);
            const placeholderEl = document.getElementById(`placeholder-prev-${t.id}`);
            setPreviewImage(t, imgEl, placeholderEl);

            // Desktop Hover Overlay logic
            const inputEl = document.querySelector(`input[value="${t.id}"]`);
            if (inputEl) {
                const labelEl = inputEl.closest('.template-option');
                if (labelEl) {
                    labelEl.addEventListener('mouseenter', () => {
                        // Strict desktop boundary check
                        if (window.innerWidth > 1024 && t.resolvedPreview) {
                            const overlay = document.getElementById('desktop-hover-overlay');
                            const hoverImg = document.getElementById('desktop-hover-img');
                            if (overlay && hoverImg) {
                                hoverImg.src = t.resolvedPreview;
                                overlay.style.visibility = 'visible';
                                overlay.style.opacity = '1';
                            }
                        }
                    });
                    labelEl.addEventListener('mouseleave', () => {
                        const overlay = document.getElementById('desktop-hover-overlay');
                        if (overlay) {
                            overlay.style.visibility = 'hidden';
                            overlay.style.opacity = '0';
                        }
                    });
                }
            }
        });

        // Initialize Desktop Hover Overlay DOM
        if (!document.getElementById('desktop-hover-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'desktop-hover-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';
            overlay.style.pointerEvents = 'none'; // Critical to allow mouseleave to fire
            overlay.style.visibility = 'hidden';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s ease, visibility 0.2s ease';

            const imgContainer = document.createElement('div');
            imgContainer.style.background = 'rgba(15, 23, 42, 0.95)';
            imgContainer.style.padding = '1.5rem';
            imgContainer.style.borderRadius = '16px';
            imgContainer.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.5)';
            imgContainer.style.backdropFilter = 'blur(10px)';
            imgContainer.style.border = '1px solid rgba(255,255,255,0.1)';

            const img = document.createElement('img');
            img.id = 'desktop-hover-img';
            img.style.maxWidth = '90vw';
            img.style.maxHeight = '85vh';
            img.style.width = 'auto';
            img.style.height = 'auto'; // True dimensions prevent raster upscaling
            img.style.display = 'block';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2)';

            imgContainer.appendChild(img);
            overlay.appendChild(imgContainer);
            document.body.appendChild(overlay);
        }
    }

    const mobileTemplateModal = document.getElementById('mobile-template-modal');
    const closeMobileTemplateBtn = document.getElementById('close-mobile-template');
    const selectMobileTemplateBtn = document.getElementById('btn-select-mobile-template');

    const closeMobileModal = () => {
        if (mobileTemplateModal) mobileTemplateModal.classList.remove('active');
    };

    if (closeMobileTemplateBtn) {
        closeMobileTemplateBtn.addEventListener('click', closeMobileModal);
    }

    if (mobileTemplateModal) {
        mobileTemplateModal.addEventListener('click', (e) => {
            if (e.target === mobileTemplateModal) closeMobileModal();
        });
    }

    if (selectMobileTemplateBtn) {
        selectMobileTemplateBtn.addEventListener('click', () => {
            closeMobileModal();
            if (currentStep < totalSteps) showStep(currentStep + 1);
        });
    }

    const templateRadios = document.querySelectorAll('input[name="template"]');
    templateRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedTemplate = e.target.value;
                if (photoContainer) {
                    photoContainer.style.display = 'none'; // Hidden: photo system architecture retained, but default templates do not natively implement it
                }

                // Trigger modal for mobile and tablet users
                if (window.innerWidth <= 1024 && mobileTemplateModal) {
                    const t = templatesList.find(t => t.id === selectedTemplate);
                    if (t) {
                        document.getElementById('mobile-template-title').innerText = t.name;
                        if (t.resolvedPreview) {
                            document.getElementById('mobile-template-img').innerHTML = `<img src="${t.resolvedPreview}" alt="${t.name}">`;
                        } else {
                            document.getElementById('mobile-template-img').innerHTML = `
                                <img id="mobile-preview-${t.id}" alt="${t.name}" style="display:none; width:100%; height:auto;">
                                <div id="mobile-placeholder-${t.id}" style="padding: 3rem; color: #6b7280; display:flex; justify-content:center;">Loading...</div>
                            `;
                            setPreviewImage(t, document.getElementById(`mobile-preview-${t.id}`), document.getElementById(`mobile-placeholder-${t.id}`));
                        }
                        mobileTemplateModal.classList.add('active');
                    }
                }
            }
        });
    });

    let profilePhotoDataUrl = 'https://via.placeholder.com/150';
    const photoInput = document.getElementById('profilePhoto');
    if (photoInput) {
        photoInput.addEventListener('change', function () {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    profilePhotoDataUrl = e.target.result;
                }
                reader.readAsDataURL(file);
            } else {
                profilePhotoDataUrl = 'https://via.placeholder.com/150';
            }
        });
    }

    // Sidebar clickable navigation
    for (let i = 1; i <= totalSteps; i++) {
        const navItem = document.getElementById(`nav-step-${i}`);
        if (navItem) {
            navItem.addEventListener('click', () => {
                if (currentStep === 1 && i > 1 && !selectedTemplate) {
                    alert("Please select a template to continue");
                    return;
                }
                showStep(i);
            });
        }
    }

    // Brand logo click
    document.getElementById('brand-logo').addEventListener('click', () => navigateTo('home'));

    // Navbar links
    if (navLinks.home) navLinks.home.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });
    if (navLinks.about) navLinks.about.addEventListener('click', (e) => { e.preventDefault(); navigateTo('about'); });
    if (navLinks.contact) navLinks.contact.addEventListener('click', (e) => { e.preventDefault(); navigateTo('contact'); });
    if (navLinks.privacy) navLinks.privacy.addEventListener('click', (e) => { e.preventDefault(); navigateTo('privacy'); });

    // Mobile Hamburger Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const navLinksContainer = document.querySelector('.nav-links');

    if (menuToggle && navLinksContainer) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navLinksContainer.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (navLinksContainer.classList.contains('active') && !navLinksContainer.contains(e.target) && e.target !== menuToggle) {
                navLinksContainer.classList.remove('active');
            }
        });

        // Close dropdown when clicking a nav item (mobile only)
        navLinksContainer.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    navLinksContainer.classList.remove('active');
                }
            });
        });
    }

    document.getElementById('btn-start').addEventListener('click', () => {
        showStep(1);
        navigateTo('form');
    });
    document.getElementById('btn-back-home').addEventListener('click', () => navigateTo('home'));
    document.getElementById('btn-edit').addEventListener('click', () => navigateTo('form'));

    // --- Dynamic Form Fields ---
    const setupDynamicList = (addBtnId, listId, templateId) => {
        const addBtn = document.getElementById(addBtnId);
        const list = document.getElementById(listId);
        const template = document.getElementById(templateId);

        const addItem = () => {
            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.dynamic-item');

            // Setup remove button on the injected item
            const removeBtn = item.querySelector('.btn-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    list.removeChild(item);
                });
            }

            // Setup current work logic if checkbox exists
            const currentCb = item.querySelector('.current-work-cb');
            if (currentCb) {
                currentCb.addEventListener('change', (e) => {
                    const endFields = item.querySelectorAll('.end-date-field');
                    endFields.forEach(f => {
                        f.disabled = e.target.checked;
                        if (e.target.checked) f.value = ''; // clear value
                    });
                });
            }

            // Setup rich text editor
            const toolbarBtns = item.querySelectorAll('.btn-format');
            const editor = item.querySelector('.rich-text-editor');

            if (editor) {
                toolbarBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const command = btn.getAttribute('data-command');
                        document.execCommand(command, false, null);
                        editor.focus();
                        updateToolbarState();
                    });
                });

                const updateToolbarState = () => {
                    toolbarBtns.forEach(btn => {
                        const command = btn.getAttribute('data-command');
                        if (document.queryCommandState(command)) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                };

                editor.addEventListener('keyup', updateToolbarState);
                editor.addEventListener('mouseup', updateToolbarState);
                editor.addEventListener('click', updateToolbarState);
            }

            list.appendChild(clone);
        };

        addBtn.addEventListener('click', addItem);
        // Add one initial item
        addItem();
    };

    setupDynamicList('btn-add-exp', 'exp-list', 'exp-template');
    setupDynamicList('btn-add-edu', 'edu-list', 'edu-template');
    setupDynamicList('btn-add-proj', 'proj-list', 'proj-template');

    // --- Accordion Logic ---
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const content = item.querySelector('.accordion-content');
            item.classList.toggle('active');
            content.classList.toggle('active');
        });
    });

    const setupStandaloneRichText = (editorId) => {
        const editor = document.getElementById(editorId);
        if (!editor) return;
        const wrapper = editor.parentElement;
        const toolbarBtns = wrapper.querySelectorAll('.btn-format');

        toolbarBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const command = btn.getAttribute('data-command');
                document.execCommand(command, false, null);
                editor.focus();
                updateToolbarState();
            });
        });

        const updateToolbarState = () => {
            toolbarBtns.forEach(btn => {
                const command = btn.getAttribute('data-command');
                if (document.queryCommandState(command)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        };

        editor.addEventListener('keyup', updateToolbarState);
        editor.addEventListener('mouseup', updateToolbarState);
        editor.addEventListener('click', updateToolbarState);
    };

    setupStandaloneRichText('certifications-editor');
    setupStandaloneRichText('hobbies-editor');

    // --- Dynamic Languages ---
    const langContainer = document.getElementById('languages-container');
    if (langContainer) {
        const predefined = ['English', 'Hindi', 'Tamil', 'Telugu', 'Marathi'];
        let langHtml = '<div class="language-options" id="lang-tags">';
        predefined.forEach(l => {
            langHtml += `
            <div class="language-chip">
                <input type="checkbox" id="lang_${l}" name="languages" value="${l}">
                <label for="lang_${l}">${l}</label>
            </div>`;
        });
        langHtml += `</div>
        <div class="add-language-row">
            <input type="text" id="custom-lang-input" placeholder="e.g. French, German...">
            <button type="button" class="btn btn-secondary" id="btn-add-lang">Add</button>
        </div>`;
        langContainer.innerHTML = langHtml;

        document.getElementById('btn-add-lang').addEventListener('click', () => {
            const input = document.getElementById('custom-lang-input');
            const val = input.value.trim();
            if (val) {
                const tagsDb = document.getElementById('lang-tags');
                const chip = document.createElement('div');
                chip.className = 'language-chip';
                const id = 'lang_custom_' + Date.now();
                chip.innerHTML = `
                    <input type="checkbox" id="${id}" name="languages" value="${escapeHTML(val)}" checked>
                    <label for="${id}">${escapeHTML(val)}</label>
                    <i class="fas fa-times remove-lang-btn" style="cursor:pointer; margin-left: 5px; color: var(--text-secondary);"></i>
                `;
                tagsDb.appendChild(chip);
                input.value = '';

                chip.querySelector('.remove-lang-btn').addEventListener('click', () => {
                    chip.remove();
                });
            }
        });
    }

    // --- Form Submission & Resume Generation ---
    const form = document.getElementById('resume-form');
    const resumeDoc = document.getElementById('resume-document');

    document.getElementById('btn-generate').addEventListener('click', (e) => {
        e.preventDefault();

        // Basic Form Validation (Native validation is blocked by hidden step elements)
        const requiredInputs = form.querySelectorAll('[required]');
        for (let input of requiredInputs) {
            if (input.closest('#step-7')) continue; // Skip validation for optional Additional Info sections
            if (!input.disabled && !input.value.trim()) {
                alert(`Please fill out all required fields before generating. Blank field found: ${input.previousElementSibling ? input.previousElementSibling.innerText : input.name}`);
                return; // Stop generation
            }
        }


        // 1. Gather Personal Info
        const formData = new FormData(form);
        const fName = formData.get('firstName') || '';
        const sName = formData.get('surname') || '';

        const data = {
            template: selectedTemplate,
            fullName: `${fName} ${sName}`.trim(),
            title: formData.get('title') || '',
            email: formData.get('email') || '',
            phone: formData.get('phone') || '',
            city: formData.get('city') || '',
            country: formData.get('country') || '',
            summary: formData.get('summary') || '',
            skills: formData.get('skills') || '',
            profilePhoto: profilePhotoDataUrl
        };

        // 2. Gather Dynamic Arrays (Work Experience)
        const experiences = Array.from(document.querySelectorAll('#exp-list .dynamic-item')).map(item => {
            return {
                company: item.querySelector('[name="expCompany[]"]').value,
                role: item.querySelector('[name="expRole[]"]').value,
                location: item.querySelector('[name="expLocation[]"]').value,
                remote: item.querySelector('[name="expRemote[]"]').checked,
                startMonth: item.querySelector('[name="expStartMonth[]"]').value,
                startYear: item.querySelector('[name="expStartYear[]"]').value,
                endMonth: item.querySelector('[name="expEndMonth[]"]').value,
                endYear: item.querySelector('[name="expEndYear[]"]').value,
                current: item.querySelector('.current-work-cb').checked,
                description: item.querySelector('.rich-text-editor') ? item.querySelector('.rich-text-editor').innerHTML : ''
            };
        });

        const education = Array.from(document.querySelectorAll('#edu-list .dynamic-item')).map(item => {
            return {
                school: item.querySelector('[name="eduCollege[]"]').value,
                location: item.querySelector('[name="eduLocation[]"]').value,
                degree: item.querySelector('[name="eduDegree[]"]').value,
                fieldOfStudy: item.querySelector('[name="eduFieldOfStudy[]"]').value,
                gradMonth: item.querySelector('[name="eduGradMonth[]"]').value,
                gradYear: item.querySelector('[name="eduGradYear[]"]').value,
                coursework: item.querySelector('[name="eduCoursework[]"]').value
            };
        });

        const projects = Array.from(document.querySelectorAll('#proj-list .dynamic-item')).map(item => {
            return {
                name: item.querySelector('[name="projName[]"]').value,
                link: item.querySelector('[name="projLink[]"]').value,
                desc: item.querySelector('.rich-text-editor') ? item.querySelector('.rich-text-editor').innerHTML : ''
            };
        }).filter(p => !!p.name.trim() || (p.desc && p.desc.trim() !== '' && p.desc !== '<br>'));

        const additionalInfo = {
            dob: formData.get('personalDob') || '',
            nationality: formData.get('personalNationality') || '',
            maritalStatus: formData.get('personalMarital') || '',
            visaStatus: formData.get('personalVisa') || '',
            gender: formData.get('personalGender') || '',
            religion: formData.get('personalReligion') || '',
            website: formData.get('website') || '',
            linkedin: formData.get('linkedin') || '',
            certifications: document.getElementById('certifications-editor') ? document.getElementById('certifications-editor').innerHTML : '',
            hobbies: document.getElementById('hobbies-editor') ? document.getElementById('hobbies-editor').innerHTML : '',
            languages: Array.from(document.querySelectorAll('input[name="languages"]:checked')).map(cb => cb.value)
        };

        currentResumeData = {
            contact: data,
            work: experiences,
            education: education,
            projects: projects,
            additional: additionalInfo,
            skills: data.skills.split(',').map(s => s.trim()).filter(s => !!s),
            summary: data.summary
        };

        // 3. Build HTML Template string
        let htmlStr = '';

        if (data.template === 'professional') {
            htmlStr += `
                <div class="prof-accent"></div>
                <div class="prof-header">
                    <div class="prof-name">${escapeHTML(data.fullName)}</div>
                </div>
                <div class="prof-body">
                    <div class="prof-left">
                        <div class="prof-section">
                            <div class="prof-section-title">Professional Summary</div>
                            <div class="prof-text">${escapeHTML(data.summary)}</div>
                        </div>
                        
                        <div class="prof-section">
                            <div class="prof-section-title">Work Experience</div>
            `;
            for (let i = 0; i < experiences.length; i++) {
                const exp = experiences[i];
                if (!exp.company.trim()) continue;
                let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                let locationStr = exp.remote ? 'Remote' : exp.location;
                let metaStr = `${escapeHTML(exp.company)} | ${escapeHTML(locationStr)} | ${escapeHTML(durationStr)}`;
                htmlStr += `
                    <div class="prof-item">
                        <div class="prof-item-title">${escapeHTML(exp.role)}</div>
                        <div class="prof-item-meta">${metaStr}</div>
                        <div class="prof-item-desc">
                            ${exp.description}
                        </div>
                    </div>
                `;
            }

            htmlStr += `
                        </div>
                        <div class="prof-section">
                            <div class="prof-section-title">Education</div>
            `;
            for (let i = 0; i < education.length; i++) {
                const edu = education[i];
                if (!edu.school.trim()) continue;
                htmlStr += `
                    <div class="prof-item">
                        <div class="prof-item-title">${escapeHTML(edu.degree)} in ${escapeHTML(edu.fieldOfStudy)}</div>
                        <div class="prof-item-meta">${escapeHTML(edu.school)} | ${escapeHTML(edu.location)} | ${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</div>
                        ${edu.coursework.trim() ? `<div class="prof-text" style="margin-top: 5px;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                    </div>
                `;
            }

            htmlStr += `
                        </div>
            `;
            if (projects.length > 0) {
                htmlStr += `
                        <div class="prof-section">
                            <div class="prof-section-title">Projects</div>`;
                projects.forEach(p => {
                    htmlStr += `
                    <div class="prof-item">
                        <div class="prof-item-title">${escapeHTML(p.name)}</div>
                        ${p.link ? `<div class="prof-item-meta"><a href="${escapeHTML(p.link)}">${escapeHTML(p.link)}</a></div>` : ''}
                        <div class="prof-text" style="margin-top: 5px;">${p.desc}</div>
                    </div>`;
                });
                htmlStr += `</div>`;
            }

            if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                htmlStr += `
                        <div class="prof-section">
                            <div class="prof-section-title">Certifications</div>
                            <div class="prof-text">${additionalInfo.certifications}</div>
                        </div>`;
            }
            if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                htmlStr += `
                        <div class="prof-section">
                            <div class="prof-section-title">Hobbies</div>
                            <div class="prof-text">${additionalInfo.hobbies}</div>
                        </div>`;
            }

            htmlStr += `
                    </div>
                    <div class="prof-right">
                        <div class="prof-section">
                            <div class="prof-section-title">Contact</div>
                            <div class="prof-contact-item"><i class="fas fa-envelope"></i> ${escapeHTML(data.email)}</div>
                            <div class="prof-contact-item"><i class="fas fa-phone"></i> ${escapeHTML(data.phone)}</div>
                        </div>
                        
                        <div class="prof-section">
                            <div class="prof-section-title">Skills</div>
                            <ul class="prof-list" style="list-style-type: none; padding-left: 0;">
                                ${data.skills.split(',').map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}
                            </ul>
                        </div>
                        
                        ${additionalInfo.languages.length > 0 ? `
                        <div class="prof-section">
                            <div class="prof-section-title">Languages</div>
                            <ul class="prof-list" style="list-style-type: none; padding-left: 0;">
                                ${additionalInfo.languages.map(l => `<li>${escapeHTML(l)}</li>`).join('')}
                            </ul>
                        </div>` : ''}
                        
                        ${(additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) ? `
                        <div class="prof-section">
                            <div class="prof-section-title">Personal Details</div>
                            ${additionalInfo.nationality ? `<div class="prof-contact-item" style="font-size:0.85rem">Nationality: ${escapeHTML(additionalInfo.nationality)}</div>` : ''}
                            ${additionalInfo.maritalStatus ? `<div class="prof-contact-item" style="font-size:0.85rem">Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}</div>` : ''}
                            ${additionalInfo.visaStatus ? `<div class="prof-contact-item" style="font-size:0.85rem">Visa Status: ${escapeHTML(additionalInfo.visaStatus)}</div>` : ''}
                            ${additionalInfo.dob ? `<div class="prof-contact-item" style="font-size:0.85rem">DOB: ${escapeHTML(additionalInfo.dob)}</div>` : ''}
                        </div>` : ''}
                    </div>
                </div>
            `;
        } else {
            // Original logic for Classic, Creative
            htmlStr += `
                <div class="cv-header">
                    <div class="cv-name">${escapeHTML(data.fullName)}</div>
                    <div class="cv-contact">
`;
            let contactItems = [];
            if (data.email) contactItems.push(`<span>${escapeHTML(data.email)}</span>`);
            if (data.phone) contactItems.push(`<span>${escapeHTML(data.phone)}</span>`);
            if (data.city) contactItems.push(`<span>${escapeHTML(data.city)}</span>`);
            if (additionalInfo.website) contactItems.push(`<span>${escapeHTML(additionalInfo.website)}</span>`);
            if (additionalInfo.linkedin) contactItems.push(`<span>${escapeHTML(additionalInfo.linkedin)}</span>`);
            htmlStr += `                        ${contactItems.join(' | ')}\n`;
            htmlStr += `                    </div>
                </div>

                <div class="cv-section">
                    <div class="cv-section-title">Professional Summary</div>
                    <div class="cv-summary">${escapeHTML(data.summary)}</div>
                </div>
                
                <div class="cv-section">
                    <div class="cv-section-title">Skills</div>
                    <div class="cv-skills">
                        ${data.skills.split(',').map(s => `<span class="cv-skill-tag">${escapeHTML(s.trim())}</span>`).join('')}
                    </div>
                </div>

                <div class="cv-section">
                    <div class="cv-section-title">Work Experience</div>
            `;

            for (let i = 0; i < experiences.length; i++) {
                const exp = experiences[i];
                if (!exp.company.trim()) continue; // Skip empty
                let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                let locationStr = exp.remote ? 'Remote' : exp.location;
                htmlStr += `
                    <div class="cv-item">
                        <div class="cv-item-header">
                            <div class="cv-item-title">${escapeHTML(exp.role)} at ${escapeHTML(exp.company)}</div>
                            <div class="cv-item-date">${escapeHTML(durationStr)}</div>
                        </div>
                        <div class="cv-item-subtitle">${escapeHTML(locationStr)}</div>
                        <div class="cv-item-desc">${exp.description}</div>
                    </div>
                `;
            }
            htmlStr += `</div>`;

            htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Education</div>
            `;
            for (let i = 0; i < education.length; i++) {
                const edu = education[i];
                if (!edu.school.trim()) continue;
                htmlStr += `
                    <div class="cv-item">
                        <div class="cv-item-header">
                            <div class="cv-item-title">${escapeHTML(edu.degree)} in ${escapeHTML(edu.fieldOfStudy)}</div>
                            <div class="cv-item-date">${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</div>
                        </div>
                        <div class="cv-item-subtitle">${escapeHTML(edu.school)}, ${escapeHTML(edu.location)}</div>
                        ${edu.coursework.trim() ? `<div class="cv-item-desc"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                    </div>
                `;
            }
            htmlStr += `</div>`;

            htmlStr += `
            `;
            if (projects.length > 0) {
                htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Projects</div>`;
                projects.forEach(p => {
                    htmlStr += `
                    <div class="cv-item">
                        <div class="cv-item-header">
                            <div class="cv-item-title">${escapeHTML(p.name)}</div>
                            ${p.link ? `<div class="cv-item-date"><a href="${escapeHTML(p.link)}" style="color:inherit;">${escapeHTML(p.link)}</a></div>` : ''}
                        </div>
                        <div class="cv-item-desc">${p.desc}</div>
                    </div>`;
                });
                htmlStr += `</div>`;
            }

            if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Certifications</div>
                    <div class="cv-summary">${additionalInfo.certifications}</div>
                </div>`;
            }

            if (additionalInfo.languages.length > 0) {
                htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Languages</div>
                    <div class="cv-skills">
                        ${additionalInfo.languages.map(l => `<span class="cv-skill-tag">${escapeHTML(l)}</span>`).join('')}
                    </div>
                </div>`;
            }

            if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Hobbies</div>
                    <div class="cv-summary">${additionalInfo.hobbies}</div>
                </div>`;
            }

            if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                htmlStr += `
                <div class="cv-section">
                    <div class="cv-section-title">Personal Details</div>
                    <div class="cv-summary" style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        ${additionalInfo.nationality ? `<div><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>` : ''}
                        ${additionalInfo.maritalStatus ? `<div><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>` : ''}
                        ${additionalInfo.visaStatus ? `<div><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>` : ''}
                        ${additionalInfo.dob ? `<div><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>` : ''}
                    </div>
                </div>`;
            }

        }

        // 4. Inject into DOM
        resumeDoc.innerHTML = htmlStr;

        // Apply selected template class
        resumeDoc.className = 'resume-document template-' + data.template;

        // 5. Navigate to preview
        navigateTo('preview');

        // 6. Adjust scale dynamically for mobile
        setTimeout(adjustMobileScale, 50);
    });

    // --- Dynamic Mobile Scale Logic ---
    function adjustMobileScale() {
        const wrapper = document.querySelector('.resume-wrapper');
        const docElement = document.getElementById('resume-document');

        if (!wrapper || !docElement) return;

        if (window.innerWidth <= 768) {
            // Reset to measure original
            docElement.style.transform = 'none';
            wrapper.style.height = 'auto';

            const screenWidth = window.innerWidth;
            // Subtract 32px to allow a tiny visual margin on mobile screens
            const scale = (screenWidth - 32) / 816;

            docElement.style.transform = `scale(${scale})`;
            docElement.style.transformOrigin = 'top center';

            // Get original height of the content mathematically
            const originalHeight = docElement.scrollHeight || 1056;

            // Use flex to cleanly center the scaled container without arbitrary layout pushes
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.padding = '16px 0'; // Only vertical padding, flex handles horizontal
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.overflow = 'hidden';
            wrapper.style.width = '100%';
            wrapper.style.height = `${(originalHeight * scale) + 32}px`;
        } else {
            // Desktop fallback
            docElement.style.transform = 'none';
            wrapper.style.height = 'auto';
            wrapper.style.overflow = 'auto';
            wrapper.style.padding = '0';
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
        }
    }

    // Bind resize dynamically
    window.addEventListener('resize', () => {
        if (views.preview && views.preview.classList.contains('active')) {
            adjustMobileScale();
        }
    });

    // --- PDF Download Logic ---
    // Instead of downloading directly, check premium status first
    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', async (e) => {
            const originalHtml = btnDownload.innerHTML;
            btnDownload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
            btnDownload.disabled = true;

            const user = auth.currentUser;
            let isPremium = false;
            let hasSingleDownload = false;

            if (!user) {
                pendingPaymentPrompt = true;
                const authModal = document.getElementById('auth-modal');
                if (authModal) authModal.classList.add('active');
                btnDownload.innerHTML = originalHtml;
                btnDownload.disabled = false;
                return;
            }

            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.premium === true && data.expiresAt && data.expiresAt > Date.now()) {
                            isPremium = true;
                        } else if (data.singleDownload === true) {
                            hasSingleDownload = true;
                        }
                    }
                } catch (error) {
                    console.error("Error checking premium status:", error);
                }
            }

            try {
                if (isPremium) {
                    if (typeof window.triggerPDFDownload === 'function') {
                        window.triggerPDFDownload();
                    }
                } else if (hasSingleDownload) {
                    if (typeof window.triggerPDFDownload === 'function') {
                        await window.triggerPDFDownload();
                    }
                    try {
                        await setDoc(doc(db, "users", user.uid), { singleDownload: false }, { merge: true });
                    } catch (err) {
                        console.error("Error consuming single download:", err);
                    }
                } else {
                    if (typeof window.openPaymentModal === 'function') {
                        window.openPaymentModal();
                    }
                }
            } finally {
                btnDownload.innerHTML = originalHtml;
                btnDownload.disabled = false;
            }
        });
    }

    // This function will be called after successful payment (future integration)
    window.triggerPDFDownload = function () {
        const originalElement = document.getElementById('resume-document');
        const isMobile = window.innerWidth <= 768;

        // 1. Create a dedicated PDF container to isolate from mobile CSS
        const pdfContainer = document.createElement('div');
        pdfContainer.id = 'pdf-container';

        // Hide from view but keep it in DOM for rendering
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.top = '0';

        // Clone the document
        const clone = originalElement.cloneNode(true);

        // 2. Remove mobile CSS influence & apply fixed layout
        clone.style.transform = 'none';
        // (padding overrides removed so native template paddings are preserved to stop text bleeding)

        // 3. Image Fix: maintain aspect ratio without stretching
        const profileImg = clone.querySelector('.profile img, #profile-img-preview, img');
        if (profileImg) {
            profileImg.style.width = '170px';
            profileImg.style.height = '170px';
            profileImg.style.objectFit = 'cover';
            profileImg.style.maxWidth = 'none';
        }

        pdfContainer.appendChild(clone);
        document.body.appendChild(pdfContainer);

        // 4. Setup PDF options with higher scaling for better resolution
        // margin set to 0 strictly to avoid pagination overflow on full-bleed 8.5x11 templates
        const opt = {
            margin: 0,
            filename: 'my_resume.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2, // Ensure good quality 
                useCORS: true,
                windowWidth: 816, // Match exact width for 8.5in letter size
                scrollY: 0,
                scrollX: 0,
                x: 0,
                y: 0
            },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // 5. Generate and download
        return html2pdf()
            .set(opt)
            .from(clone)
            .save()
            .then(() => {
                // Cleanup container
                if (document.body.contains(pdfContainer)) {
                    document.body.removeChild(pdfContainer);
                }

                if (isMobile && typeof adjustMobileScale === 'function') {
                    adjustMobileScale();
                }
            });
    };

    // Utility: XSS preventer
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    // ================= PAYMENT MODAL LOGIC =================
    const paymentModal = document.getElementById('payment-modal');
    const closePaymentBtn = document.getElementById('close-payment-modal');

    // Global API to trigger the modal
    window.openPaymentModal = function () {
        if (paymentModal) {
            paymentModal.classList.add('active');
        }
    };

    window.closePaymentModal = function () {
        if (paymentModal) {
            paymentModal.classList.remove('active');
        }
    };

    if (closePaymentBtn) {
        closePaymentBtn.addEventListener('click', window.closePaymentModal);
    }

    if (paymentModal) {
        // Close on outside click
        paymentModal.addEventListener('click', (e) => {
            if (e.target === paymentModal) {
                window.closePaymentModal();
            }
        });

        // Razorpay Payment Logic
        async function handlePaymentSuccess(amountValue) {
            // Step 1: mark user as premium
            const user = auth.currentUser;
            const isMonthly = amountValue === 1900;

            if (user) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    const planData = isMonthly ? {
                        premium: true,
                        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
                    } : {
                        singleDownload: true
                    };
                    await setDoc(userRef, planData, { merge: true });
                } catch (error) {
                    console.error("Error setting premium status:", error);
                }
            }

            // Step 2: show success message
            if (isMonthly) {
                alert("Payment successful! You have unlimited downloads for 30 days.");
            } else {
                alert("Payment successful! You can download your resume once.");
            }

            // Step 3: trigger download
            window.closePaymentModal();
            const btnDownload = document.getElementById('btn-download');
            if (btnDownload) {
                btnDownload.click();
            }
        }

        const simulateBtns = paymentModal.querySelectorAll('.btn-simulate-pay');
        simulateBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                let targetBtn = e.target;
                if (!targetBtn.classList.contains('btn-simulate-pay')) {
                    targetBtn = targetBtn.closest('.btn-simulate-pay');
                }
                const amountValue = parseInt(targetBtn.getAttribute('data-amount') || 200, 10);

                const options = {
                    key: "rzp_live_SYKrxIL6dlt09U",
                    amount: amountValue,
                    currency: "INR",
                    name: "Resume Builder",
                    description: "Resume Download",
                    handler: function (response) {
                        handlePaymentSuccess(amountValue);
                    },
                    prefill: {
                        name: "User",
                        email: "test@example.com",
                        contact: "9999999999"
                    },
                    theme: {
                        color: "#6366f1"
                    }
                };

                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (response) {
                    alert("Payment Failed: " + response.error.description);
                });
                rzp.open();
            });
        });
    }

    // --- FIREBASE AUTHENTICATION & SAVE LOGIC ---
    const linkLogin = document.getElementById('link-login');
    const linkLogout = document.getElementById('link-logout');
    const authModal = document.getElementById('auth-modal');
    const closeAuthBtn = document.getElementById('close-auth-modal');
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authToggleText = document.getElementById('auth-toggle-text');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const authErrorMsg = document.getElementById('auth-error-msg');
    const btnSave = document.getElementById('btn-save');

    
    let currentUser = null;

    if (linkLogin && linkLogout) {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            if (user) {
                linkLogin.style.display = 'none';
                linkLogout.style.display = 'block';
                if (authModal) authModal.classList.remove('active');
            } else {
                linkLogin.style.display = 'block';
                linkLogout.style.display = 'none';
            }
        });

        linkLogin.addEventListener('click', (e) => {
            e.preventDefault();
            if (authModal) authModal.classList.add('active');
        });

        linkLogout.addEventListener('click', (e) => {
            e.preventDefault();
            signOut(auth);
        });
    }

    if (closeAuthBtn && authModal) {
        closeAuthBtn.addEventListener('click', () => {
            authModal.classList.remove('active');
            if (authErrorMsg) authErrorMsg.style.display = 'none';
            if (authForm) authForm.reset();
        });
    }

    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            updateAuthModalUI();
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = authEmail.value;
            const password = authPassword.value;
            authErrorMsg.style.display = 'none';

            try {
                authSubmitBtn.disabled = true;
                authSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                if (isSignUpMode) {
                    await createUserWithEmailAndPassword(auth, email, password);
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }

                authForm.reset();
                if (authModal) authModal.classList.remove('active');

                if (pendingPaymentPrompt) {
                    pendingPaymentPrompt = false;
                    setTimeout(() => {
                        if (typeof window.openPaymentModal === 'function') {
                            window.openPaymentModal();
                        }
                    }, 500); // short delay to allow auth state UI updates
                } else {
                    alert(isSignUpMode ? "Registration successful!" : "Login successful!");
                    window.location.href = "my-resumes.html";
                }
            } catch (error) {
                authErrorMsg.innerText = error.message;
                authErrorMsg.style.display = 'block';
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.innerText = isSignUpMode ? 'Sign Up' : 'Login';
            }
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (!currentUser) {
                if (authModal) authModal.classList.add('active');
                return;
            }
            if (!currentResumeData) {
                alert("Please generate a resume first before saving.");
                return;
            }

            try {
                const originalText = btnSave.innerHTML;
                btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                btnSave.disabled = true;

                const resumesRef = collection(db, "resumes");
                await addDoc(resumesRef, {
                    userId: currentUser.uid,
                    templateId: currentResumeData.contact.template || "modern",
                    name: currentResumeData.contact.fullName ? `${currentResumeData.contact.fullName}'s Resume` : "Untitled Resume",
                    data: currentResumeData,
                    updatedAt: new Date()
                });

                alert("Resume saved successfully!");
            } catch (error) {
                console.error("Error saving resume: ", error);
                alert("Failed to save resume: " + error.message);
            } finally {
                btnSave.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save to Account';
                btnSave.disabled = false;
            }
        });
    }

});
