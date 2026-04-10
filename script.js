import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentResumeData = null;
    let pendingPaymentPrompt = false;

    // --- Dynamic Education Field Validation ---
    const validateEduDegree = function(degreeInput) {
        if (!degreeInput) return;
        const degreeLower = degreeInput.value.toLowerCase();
        // Check for common school-level terms
        const isSchoolLevel = ["ssc", "10", "10th", "class 10", "x", "secondary", "matric", "high school"].some(word => degreeLower.includes(word));
        const parentBlock = degreeInput.closest('.item-block');
        if (parentBlock) {
            const fieldOfStudyInput = parentBlock.querySelector('[name="eduFieldOfStudy[]"]');
            if (fieldOfStudyInput) {
                const parentGroup = fieldOfStudyInput.closest('.input-group');
                if (isSchoolLevel) {
                    fieldOfStudyInput.removeAttribute('required');
                    fieldOfStudyInput.disabled = true;
                    fieldOfStudyInput.value = ''; // Ensure value is scrubbed cleanly
                    if (parentGroup) parentGroup.style.display = 'none'; // Visibly hide the container
                } else {
                    fieldOfStudyInput.setAttribute('required', 'required');
                    fieldOfStudyInput.disabled = false;
                    if (parentGroup) parentGroup.style.display = 'block'; // Restore visibility
                }
            }
        }
    };

    window.validateEduDegree = validateEduDegree;

    // --- Dynamic Education Title Formatting ---
    window.formatEducationTitle = function(degree, fieldOfStudy) {
        if (!degree) return '';
        const degreeLower = degree.toLowerCase();
        const isSchoolLevel = ["ssc", "10", "10th", "class 10", "x", "secondary", "matric", "high school"].some(word => degreeLower.includes(word));
        
        if (isSchoolLevel) {
            return escapeHTML(degree);
        } else if (fieldOfStudy && !["n/a", "none"].includes(fieldOfStudy.trim().toLowerCase())) {
            return escapeHTML(degree) + ' in ' + escapeHTML(fieldOfStudy);
        } else {
            return escapeHTML(degree);
        }
    };

    document.addEventListener('input', function(e) {
        if (e.target && e.target.name === 'eduDegree[]') {
            validateEduDegree(e.target);
        }
    });

    // --- Real Firebase Auth & Profile Dropdown ---
    const dropdown = document.getElementById("dropdownMenu");
    const profileBtn = document.getElementById("profileBtn");

    if (dropdown) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                dropdown.innerHTML = `
                    <div class="dropdown-item" id="myResumes">My Resumes</div>
                    <div class="dropdown-item" id="mySubscription">My Subscription</div>
                    <div class="dropdown-item" id="logout">Logout</div>
                `;

                document.getElementById("logout").onclick = async () => {
                    try {
                        await signOut(auth);
                        navigateTo('home');
                        if (typeof showToast === 'function') {
                            showToast("You have been logged out successfully");
                        }
                        dropdown.classList.add("hidden");
                    } catch (error) {
                        console.error("Error during logout:", error);
                    }
                };

                document.getElementById("myResumes").onclick = () => {
                    navigateTo('dashboard');
                    fetchMyResumes();
                    dropdown.classList.add("hidden");
                };

                document.getElementById("mySubscription").onclick = () => {
                    navigateTo('subscription');
                    if(typeof fetchMySubscription === 'function') fetchMySubscription();
                    dropdown.classList.add("hidden");
                };
            } else {
                dropdown.innerHTML = `
                    <div class="dropdown-item" id="signin">Sign In</div>
                    <div class="dropdown-item" id="signup">Sign Up</div>
                `;

                document.getElementById("signin").onclick = () => {
                    if (typeof window.setAuthMode === 'function') {
                        window.setAuthMode('login');
                    }
                    dropdown.classList.add("hidden");
                };

                document.getElementById("signup").onclick = () => {
                    if (typeof window.setAuthMode === 'function') {
                        window.setAuthMode('signup');
                    }
                    dropdown.classList.add("hidden");
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
        privacy: document.getElementById('privacy-view'),
        dashboard: document.getElementById('dashboard-view'),
        subscription: document.getElementById('subscription-view')
    };

    const navLinks = {
        about: document.getElementById('link-about-footer'),
        contact: document.getElementById('link-contact-footer'),
        privacy: document.getElementById('link-privacy-footer')
    };

    const navigateTo = (viewName, skipHistory = false) => {
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

        if (!skipHistory) {
            if (viewName === "home") {
                history.pushState({ page: "home", step: null }, "", "/");
            } else {
                history.pushState(
                    { page: viewName, step: (viewName === 'form' ? currentStepIndex : null) },
                    "",
                    `?page=${viewName}${viewName === 'form' && currentStepIndex !== null ? `&step=${currentStepIndex}` : ""}`
                );
            }
        }

        window.scrollTo(0, 0);
    };

    // --- Step Navigation Logic ---
    let currentStepIndex = 0;
    let visibleSteps = [1, 2, 3, 4, 5, 6, 7, 8];
    const totalDOMSteps = 8;

    const showStepByIndex = (index, skipHistory = false) => {
        if (index < 0 || index >= visibleSteps.length) return;
        const stepNumber = visibleSteps[index];

        for (let i = 1; i <= totalDOMSteps; i++) {
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
        
        let displayNumber = 1;
        for (let i = 1; i <= totalDOMSteps; i++) {
            const navItem = document.getElementById(`nav-step-${i}`);
            if (navItem) {
                if (visibleSteps.includes(i)) {
                    navItem.style.display = 'flex';
                    const numSpan = navItem.querySelector('.step-number');
                    if (numSpan) numSpan.innerText = displayNumber;
                    displayNumber++;
                } else {
                    navItem.style.display = 'none';
                }
            }
        }

        currentStepIndex = index;

        if (!skipHistory) {
            history.pushState(
                { page: 'form', step: currentStepIndex },
                "",
                `?page=form&step=${currentStepIndex}`
            );
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.showStepByIndex = showStepByIndex;

    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => {
            const stepNumber = visibleSteps[currentStepIndex];
            if (stepNumber === 1 && !selectedTemplate) {
                alert("Please select a template to continue");
                return;
            }
            if (currentStepIndex < visibleSteps.length - 1) showStepByIndex(currentStepIndex + 1);
        });
    });

    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStepIndex > 0) showStepByIndex(currentStepIndex - 1);
        });
    });

    let selectedTemplate = null;
    const photoContainer = document.getElementById('photo-upload-container');
    const templateContainer = document.getElementById('template-selector-container');

    const templatesList = [
        { id: "modern", name: "Template 1" },
        { id: "classic", name: "Template 2" },
        { id: "creative", name: "Template 3" },
        { id: "professional", name: "Template 4" },
        { id: "5", name: "Template 5" },
        { id: "6", name: "Template 6" },
        { id: "7", name: "Template 7" },
        { id: "8", name: "Template 8" },
        { id: "9", name: "Template 9" },
        { id: "10", name: "Template 10" },
        { id: "11", name: "Template 11" },
        { id: "12", name: "Template 12" },
        { id: "13", name: "Template 13" },
        { id: "14", name: "Template 14" },
        { id: "15", name: "Template 15" },
        { id: "16", name: "Template 16" },
        { id: "17", name: "Template 17" }
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
            imgContainer.style.padding = '0.5rem';
            imgContainer.style.borderRadius = '16px';
            imgContainer.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.5)';
            imgContainer.style.backdropFilter = 'blur(10px)';
            imgContainer.style.border = '1px solid rgba(255,255,255,0.1)';
            imgContainer.style.display = 'flex';
            imgContainer.style.flexDirection = 'column';
            imgContainer.style.overflow = 'hidden';

            const overlayText = document.createElement('div');
            overlayText.innerText = 'Click to select this template';
            overlayText.style.width = '100%';
            overlayText.style.padding = '0.6rem 1rem';
            overlayText.style.background = 'rgba(255, 255, 255, 0.05)';
            overlayText.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            overlayText.style.color = '#fff';
            overlayText.style.textAlign = 'center';
            overlayText.style.fontWeight = '500';
            overlayText.style.fontSize = '0.9rem';
            overlayText.style.letterSpacing = '0.5px';
            overlayText.style.marginBottom = '0.5rem';
            overlayText.style.borderTopLeftRadius = '12px';
            overlayText.style.borderTopRightRadius = '12px';

            const img = document.createElement('img');
            img.id = 'desktop-hover-img';
            img.style.maxWidth = '90vw';
            img.style.maxHeight = '80vh';
            img.style.width = 'auto';
            img.style.height = 'auto'; // True dimensions prevent raster upscaling
            img.style.display = 'block';
            img.style.borderRadius = '12px';
            img.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2)';

            imgContainer.appendChild(overlayText);
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
            if (currentStepIndex < visibleSteps.length - 1) showStepByIndex(currentStepIndex + 1);
        });
    }

    const templateRadios = document.querySelectorAll('input[name="template"]');
    templateRadios.forEach(radio => {
        radio.addEventListener('click', (e) => {
            selectedTemplate = radio.value;
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
            } else {
                if (currentStepIndex < visibleSteps.length - 1) showStepByIndex(currentStepIndex + 1);
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
    for (let i = 1; i <= totalDOMSteps; i++) {
        const navItem = document.getElementById(`nav-step-${i}`);
        if (navItem) {
            navItem.addEventListener('click', () => {
                if (!visibleSteps.includes(i)) return;
                const targetIndex = visibleSteps.indexOf(i);
                if (visibleSteps[currentStepIndex] === 1 && targetIndex > 0 && !selectedTemplate) {
                    alert("Please select a template to continue");
                    return;
                }
                showStepByIndex(targetIndex);
            });
        }
    }

    // Brand logo click
    document.getElementById('brand-logo').addEventListener('click', () => navigateTo('home'));

    // Navbar links
    if (navLinks.about) navLinks.about.addEventListener('click', (e) => { e.preventDefault(); navigateTo('about'); });
    if (navLinks.contact) navLinks.contact.addEventListener('click', (e) => { e.preventDefault(); navigateTo('contact'); });
    if (navLinks.privacy) navLinks.privacy.addEventListener('click', (e) => { e.preventDefault(); navigateTo('privacy'); });



    document.getElementById('btn-start').addEventListener('click', () => {
        showStepByIndex(0);
        navigateTo('form');
    });
    const btnCreateNew = document.getElementById('btn-create-new');
    if (btnCreateNew) {
        btnCreateNew.addEventListener('click', () => {
            showStepByIndex(0);
            navigateTo('form');
        });
    }
    document.getElementById('btn-back-home').addEventListener('click', () => navigateTo('home'));
    document.getElementById('btn-edit').addEventListener('click', () => navigateTo('form'));

    // --- Firestore Dashboard & Fetch Logic ---

    async function fetchMyResumes() {
        const user = auth.currentUser;
        if (!user) return;

        const grid = document.getElementById('resumes-grid');
        const emptyState = document.getElementById('empty-state');
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading resumes...</div>';

        try {
            const q = query(collection(db, "resumes"), where("userId", "==", user.uid));
            const querySnapshot = await getDocs(q);

            grid.innerHTML = '';

            if (querySnapshot.empty) {
                emptyState.style.display = 'flex';
                grid.style.display = 'none';
            } else {
                emptyState.style.display = 'none';
                grid.style.display = 'grid';

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const resumeObj = data.data;

                    const card = document.createElement('div');
                    card.className = 'resume-dashboard-card';

                    // Attempt to find template to show preview
                    const t = templatesList.find(temp => temp.id === data.template);
                    let previewImgHtml = '<div style="height: 200px; background:var(--bg-color); border-bottom: 1px solid var(--card-border); display:flex; align-items:center; justify-content:center; color: var(--text-secondary);">No Preview</div>';
                    if (t && t.resolvedPreview) {
                        previewImgHtml = `<img src="${t.resolvedPreview}" alt="Resume Preview" style="width: 100%; height: 200px; object-fit: cover; border-bottom: 1px solid var(--card-border);">`;
                    }

                    const title = (resumeObj && resumeObj.contact && resumeObj.contact.title) ? resumeObj.contact.title : 'My Resume';
                    const name = (resumeObj && resumeObj.contact && resumeObj.contact.fullName) ? resumeObj.contact.fullName : 'Untitled';

                    card.innerHTML = `
                        <div class="card-preview">
                            ${previewImgHtml}
                        </div>
                        <div class="card-content" style="padding: 1.5rem;">
                            <h4 style="margin: 0 0 0.5rem 0; font-size: 1.25rem;">${escapeHTML(name)}</h4>
                            <p style="margin: 0 0 1rem 0; color: var(--text-secondary);">${escapeHTML(title)}</p>
                            <div class="card-actions" style="display: flex; flex-direction: column; gap: 0.5rem;">
                                <button class="btn btn-primary btn-small btn-edit-resume" style="width: 100%;"><i class="fas fa-edit"></i> Edit</button>
                                <div style="display: flex; gap: 0.5rem;">
                                    <button class="btn btn-secondary btn-small btn-download-resume" style="flex: 1;" title="Download"><i class="fas fa-download"></i></button>
                                    <button class="btn btn-secondary btn-small btn-duplicate-resume" style="flex: 1;" title="Duplicate"><i class="fas fa-copy"></i></button>
                                    <button class="btn btn-secondary btn-small btn-delete-resume" style="flex: 1; color: var(--danger-color);" title="Delete"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
                    grid.appendChild(card);

                    const btnEdit = card.querySelector('.btn-edit-resume');
                    const btnDownload = card.querySelector('.btn-download-resume');
                    const btnDuplicate = card.querySelector('.btn-duplicate-resume');
                    const btnDelete = card.querySelector('.btn-delete-resume');

                    btnEdit.addEventListener('click', () => {
                        if (typeof window.populateForm !== 'function') return;
                        window.populateForm(resumeObj);
                        currentResumeData = resumeObj;
                        selectedTemplate = data.template;
                        showStepByIndex(0);
                        navigateTo('form');
                    });

                    btnDownload.addEventListener('click', () => {
                        if (typeof window.generateResumeHTML !== 'function') return;
                        currentResumeData = resumeObj;
                        selectedTemplate = data.template;
                        const htmlStr = window.generateResumeHTML(resumeObj);
                        const resumeDoc = document.getElementById('resume-document');
                        if (resumeDoc) {
                            resumeDoc.innerHTML = htmlStr;
                            resumeDoc.className = 'resume-document template-' + selectedTemplate;
                            const dBtn = document.getElementById('btn-download');
                            if (dBtn) dBtn.click();
                        }
                    });

                    btnDuplicate.addEventListener('click', async () => {
                        try {
                            btnDuplicate.disabled = true;
                            const clonedData = JSON.parse(JSON.stringify(resumeObj));
                            if (clonedData.contact && clonedData.contact.title) {
                                clonedData.contact.title += ' (Copy)';
                            }
                            const savePayload = {
                                userId: user.uid,
                                data: clonedData,
                                template: data.template,
                                updatedAt: serverTimestamp()
                            };
                            await addDoc(collection(db, "resumes"), savePayload);
                            fetchMyResumes();
                        } catch (err) {
                            console.error(err);
                            alert("Failed to duplicate.");
                            btnDuplicate.disabled = false;
                        }
                    });

                    btnDelete.addEventListener('click', async () => {
                        if (confirm("Are you sure you want to delete this resume?")) {
                            try {
                                btnDelete.disabled = true;
                                await deleteDoc(doc(db, "resumes", docSnap.id));
                                fetchMyResumes();
                            } catch (err) {
                                console.error(err);
                                alert("Failed to delete.");
                                btnDelete.disabled = false;
                            }
                        }
                    });
                });
            }
        } catch (error) {
            console.error("Error fetching resumes: ", error);
            grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--danger-color); text-align: center;">Failed to load resumes.</div>';
        }
    }

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
    setupDynamicList('btn-add-intern-exp', 'intern-exp-list', 'intern-exp-template');
    setupDynamicList('btn-add-edu', 'edu-list', 'edu-template');
    setupDynamicList('btn-add-proj', 'proj-list', 'proj-template');

    // --- Dynamic Experience Logic ---
    const handleExperienceTypeChange = (type) => {
        const workSection = document.getElementById('work-experience-section');
        const internSection = document.getElementById('internship-experience-section');
        const fresherBanner = document.getElementById('fresher-tip-banner');

        if (!workSection || !internSection) return;

        if (type === 'work') {
            workSection.style.display = 'block';
            internSection.style.display = 'none';
            if(fresherBanner) fresherBanner.style.display = 'none';
            visibleSteps = [1, 2, 3, 4, 5, 6, 7, 8];
        } else if (type === 'internship') {
            workSection.style.display = 'none';
            internSection.style.display = 'block';
            if(fresherBanner) fresherBanner.style.display = 'none';
            visibleSteps = [1, 2, 3, 4, 5, 6, 7, 8];
        } else if (type === 'both') {
            workSection.style.display = 'block';
            internSection.style.display = 'block';
            if(fresherBanner) fresherBanner.style.display = 'none';
            visibleSteps = [1, 2, 3, 4, 5, 6, 7, 8];
        } else if (type === 'fresher') {
            workSection.style.display = 'none';
            internSection.style.display = 'none';
            if(fresherBanner) fresherBanner.style.display = 'block';
            visibleSteps = [1, 2, 3, 5, 6, 7, 8]; // Skip step 4 completely
        }
        
        // Refresh sidebar and visibility only if we are initialized past setup
        const isFormActive = views.form && views.form.classList.contains('active');
        if (isFormActive) {
            if (currentStepIndex > 0) {
                // Need to fix currentStepIndex if it was on a step that just hid (like Step 4 becoming hidden)
                let currStepLog = visibleSteps[currentStepIndex];
                if (!currStepLog) {
                    // we were on step 4, and it hid, so fallback to step 3
                    currStepLog = 3;
                    currentStepIndex = visibleSteps.indexOf(3);
                }
                showStepByIndex(currentStepIndex, true);
            } else {
                 // Init load
                 showStepByIndex(0, true);
            }
        }
    };

    const expRadios = document.querySelectorAll('input[name="experienceType"]');
    expRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) handleExperienceTypeChange(e.target.value);
        });
    });
    
    // Initial run
    const selectedExp = document.querySelector('input[name="experienceType"]:checked');
    if (selectedExp) {
        handleExperienceTypeChange(selectedExp.value);
    }

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

    // --- Form Hydration & Utilities ---
    const clearDynamicList = (listId) => {
        const list = document.getElementById(listId);
        if (list) list.innerHTML = '';
    };

    window.populateForm = function (resumeData) {
        if (!resumeData) return;
        const contact = resumeData.contact || {};
        const additional = resumeData.additional || {};

        if (contact.template) {
            const radio = document.querySelector(`input[name="template"][value="${contact.template}"]`);
            if (radio) {
                radio.checked = true;
                const evt = new Event('change');
                radio.dispatchEvent(evt);
            }
            selectedTemplate = contact.template;
        }

        const formObj = document.getElementById('resume-form');
        if (!formObj) return;

        const fNameInput = formObj.querySelector('input[name="firstName"]');
        const sNameInput = formObj.querySelector('input[name="surname"]');
        if (contact.fullName) {
            const parts = contact.fullName.split(' ');
            if (fNameInput) fNameInput.value = parts[0] || '';
            if (sNameInput) sNameInput.value = parts.slice(1).join(' ') || '';
        }

        const mapFields = {
            'title': contact.title,
            'email': contact.email,
            'phone': contact.phone,
            'city': contact.city,
            'country': contact.country,
            'summary': resumeData.summary || contact.summary,
            'skills': (resumeData.skills && Array.isArray(resumeData.skills)) ? resumeData.skills.join(', ') : contact.skills,
            'personalDob': additional.dob,
            'personalNationality': additional.nationality,
            'personalMarital': additional.maritalStatus,
            'personalVisa': additional.visaStatus,
            'personalGender': additional.gender,
            'personalReligion': additional.religion,
            'website': additional.website,
            'linkedin': additional.linkedin
        };

        for (const [name, val] of Object.entries(mapFields)) {
            const field = formObj.querySelector(`[name="${name}"]`);
            if (field) field.value = val || '';
        }

        if (contact.profilePhoto && contact.profilePhoto !== 'https://via.placeholder.com/150') {
            profilePhotoDataUrl = contact.profilePhoto;
        }

        document.querySelectorAll('input[name="languages"]').forEach(cb => { cb.checked = false; });
        if (additional.languages && Array.isArray(additional.languages)) {
            additional.languages.forEach(lang => {
                const cb = document.querySelector(`input[name="languages"][value="${lang}"]`);
                if (cb) cb.checked = true;
                else {
                    const btnAddLang = document.getElementById('btn-add-lang');
                    const inputCustom = document.getElementById('custom-lang-input');
                    if (btnAddLang && inputCustom) {
                        inputCustom.value = lang;
                        btnAddLang.click();
                    }
                }
            });
        }

        const certEditor = document.getElementById('certifications-editor');
        if (certEditor) certEditor.innerHTML = additional.certifications || '';
        const hobbEditor = document.getElementById('hobbies-editor');
        if (hobbEditor) hobbEditor.innerHTML = additional.hobbies || '';

        if (resumeData.experienceType) {
            const expRadio = document.querySelector(`input[name="experienceType"][value="${resumeData.experienceType}"]`);
            if (expRadio) {
                expRadio.checked = true;
                handleExperienceTypeChange(resumeData.experienceType);
            }
        } else if (resumeData.work && resumeData.work.length > 0) {
            const expRadio = document.querySelector(`input[name="experienceType"][value="work"]`);
            if (expRadio) {
                expRadio.checked = true;
                handleExperienceTypeChange('work');
            }
        }

        const workData = resumeData.workExperience || resumeData.work || [];
        clearDynamicList('exp-list');
        for (let idx = 0; idx < workData.length; idx++) {
            const exp = workData[idx];
            document.getElementById('btn-add-exp').click();
            const items = document.querySelectorAll('#exp-list .dynamic-item');
            const currentItem = items[items.length - 1];
            if (currentItem) {
                const safeSet = (sel, val) => { const e = currentItem.querySelector(sel); if (e) e.value = val || ''; };
                safeSet('[name="expCompany[]"]', exp.company);
                safeSet('[name="expRole[]"]', exp.role);
                safeSet('[name="expLocation[]"]', exp.location);
                if (exp.remote) {
                    const e = currentItem.querySelector('[name="expRemote[]"]');
                    if (e) e.checked = true;
                }
                safeSet('[name="expStartMonth[]"]', exp.startMonth);
                safeSet('[name="expStartYear[]"]', exp.startYear);

                const currentCb = currentItem.querySelector('.current-work-cb');
                if (exp.current && currentCb) {
                    currentCb.checked = true;
                    currentCb.dispatchEvent(new Event('change'));
                } else {
                    safeSet('[name="expEndMonth[]"]', exp.endMonth);
                    safeSet('[name="expEndYear[]"]', exp.endYear);
                }

                const rT = currentItem.querySelector('.rich-text-editor');
                if (rT) rT.innerHTML = exp.description || '';
            }
        }

        const internData = resumeData.internshipExperience || [];
        clearDynamicList('intern-exp-list');
        for (let idx = 0; idx < internData.length; idx++) {
            const exp = internData[idx];
            document.getElementById('btn-add-intern-exp').click();
            const items = document.querySelectorAll('#intern-exp-list .dynamic-item');
            const currentItem = items[items.length - 1];
            if (currentItem) {
                const safeSet = (sel, val) => { const e = currentItem.querySelector(sel); if (e) e.value = val || ''; };
                safeSet('[name="internCompany[]"]', exp.company);
                safeSet('[name="internRole[]"]', exp.role);
                safeSet('[name="internLocation[]"]', exp.location);
                if (exp.remote) {
                    const e = currentItem.querySelector('[name="internRemote[]"]');
                    if (e) e.checked = true;
                }
                safeSet('[name="internStartMonth[]"]', exp.startMonth);
                safeSet('[name="internStartYear[]"]', exp.startYear);

                const currentCb = currentItem.querySelector('.current-work-cb');
                if (exp.current && currentCb) {
                    currentCb.checked = true;
                    currentCb.dispatchEvent(new Event('change'));
                } else {
                    safeSet('[name="internEndMonth[]"]', exp.endMonth);
                    safeSet('[name="internEndYear[]"]', exp.endYear);
                }

                const rT = currentItem.querySelector('.rich-text-editor');
                if (rT) rT.innerHTML = exp.description || '';
            }
        }

        const eduData = resumeData.education || [];
        clearDynamicList('edu-list');
        for (let idx = 0; idx < eduData.length; idx++) {
            const edu = eduData[idx];
            document.getElementById('btn-add-edu').click();
            const items = document.querySelectorAll('#edu-list .dynamic-item');
            const currentItem = items[items.length - 1];
            if (currentItem) {
                const safeSet = (sel, val) => { const e = currentItem.querySelector(sel); if (e) e.value = val || ''; };
                safeSet('[name="eduCollege[]"]', edu.school);
                safeSet('[name="eduLocation[]"]', edu.location);
                safeSet('[name="eduDegree[]"]', edu.degree);
                safeSet('[name="eduFieldOfStudy[]"]', edu.fieldOfStudy);
                safeSet('[name="eduGradMonth[]"]', edu.gradMonth);
                safeSet('[name="eduGradYear[]"]', edu.gradYear);
                safeSet('[name="eduCoursework[]"]', edu.coursework);
                
                // Immediately check and hide the field of study if previously populated with a school term
                if (window.validateEduDegree) {
                    window.validateEduDegree(currentItem.querySelector('[name="eduDegree[]"]'));
                }
            }
        }

        const projData = resumeData.projects || [];
        clearDynamicList('proj-list');
        for (let idx = 0; idx < projData.length; idx++) {
            const proj = projData[idx];
            document.getElementById('btn-add-proj').click();
            const items = document.querySelectorAll('#proj-list .dynamic-item');
            const currentItem = items[items.length - 1];
            if (currentItem) {
                const safeSet = (sel, val) => { const e = currentItem.querySelector(sel); if (e) e.value = val || ''; };
                safeSet('[name="projName[]"]', proj.name);
                safeSet('[name="projLink[]"]', proj.link);
                const rT = currentItem.querySelector('.rich-text-editor');
                if (rT) rT.innerHTML = proj.desc || '';
            }
        }
    };

    // --- Form Submission & Resume Generation ---
    const form = document.getElementById('resume-form');
    const resumeDoc = document.getElementById('resume-document');

    document.getElementById('btn-generate').addEventListener('click', (e) => {
        e.preventDefault();

        const expTypeChecked = document.querySelector('input[name="experienceType"]:checked');
        const experienceType = expTypeChecked ? expTypeChecked.value : 'work';

        // Basic Form Validation (Native validation is blocked by hidden step elements)
        const requiredInputs = form.querySelectorAll('[required]');
        for (let input of requiredInputs) {
            if (input.closest('#step-7')) continue; // Skip validation for optional Additional Info sections
            
            // Skip dynamic experience fields based on selected type
            if (experienceType === 'fresher') {
                if (input.closest('#work-experience-section') || input.closest('#internship-experience-section')) {
                    continue;
                }
            } else if (experienceType === 'work') {
                if (input.closest('#internship-experience-section')) {
                    continue;
                }
            } else if (experienceType === 'internship') {
                if (input.closest('#work-experience-section')) {
                    continue;
                }
            }

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

        // 3. Gather Internship Experience
        const internExperiences = Array.from(document.querySelectorAll('#intern-exp-list .dynamic-item')).map(item => {
            return {
                company: item.querySelector('[name="internCompany[]"]').value,
                role: item.querySelector('[name="internRole[]"]').value,
                location: item.querySelector('[name="internLocation[]"]').value,
                remote: item.querySelector('[name="internRemote[]"]').checked,
                startMonth: item.querySelector('[name="internStartMonth[]"]').value,
                startYear: item.querySelector('[name="internStartYear[]"]').value,
                endMonth: item.querySelector('[name="internEndMonth[]"]').value,
                endYear: item.querySelector('[name="internEndYear[]"]').value,
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
            experienceType: experienceType,
            workExperience: experiences,
            internshipExperience: internExperiences,
            work: experiences, // Legacy fallback
            education: education,
            projects: projects,
            additional: additionalInfo,
            skills: data.skills.split(',').map(s => s.trim()).filter(s => !!s),
            summary: data.summary
        };

        window.generateResumeHTML = function (originalResumeData) {
            // Global central validation logic to scrub empty HTML fields before rendering any template
            const hasMeaningfulText = (html) => {
                if (!html) return false;
                const text = html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, '').trim();
                return text.length > 0;
            };
            
            // Deep clone to prevent mutating global state accidentally
            const resumeData = JSON.parse(JSON.stringify(originalResumeData));
            
            // Normalize dates globally across all templates
            const normalizeExperienceDates = (expList) => {
                if (!expList) return;
                expList.forEach(exp => {
                    let sY = parseInt(exp.startYear) || 0;
                    let eY = parseInt(exp.endYear) || 0;
                    
                    if (exp.current || exp.endYear === 'NOW' || exp.endYear === 'Present' || exp.endYear === 'PRESENT') {
                        exp.current = true;
                        exp.endYear = 'Present'; // Make standard
                        exp.endMonth = '';
                        eY = 9999;
                    }

                    if (sY > 0 && eY > 0 && sY > eY && !exp.current) {
                        let tY = exp.startYear;
                        exp.startYear = exp.endYear;
                        exp.endYear = tY;

                        let tM = exp.startMonth;
                        exp.startMonth = exp.endMonth;
                        exp.endMonth = tM;
                    }
                });
            };
            normalizeExperienceDates(resumeData.workExperience);
            normalizeExperienceDates(resumeData.work);
            normalizeExperienceDates(resumeData.internshipExperience);
            
            resumeData.projects = (resumeData.projects || []).filter(p => 
                (p.name && p.name.trim() !== '') || 
                (p.link && p.link.trim() !== '') || 
                hasMeaningfulText(p.desc)
            );
            
            resumeData.work = (resumeData.work || []).filter(exp => 
                (exp.company && exp.company.trim() !== '') || 
                (exp.role && exp.role.trim() !== '') || 
                hasMeaningfulText(exp.description)
            );
            resumeData.workExperience = resumeData.work;

            resumeData.internshipExperience = (resumeData.internshipExperience || []).filter(exp => 
                (exp.company && exp.company.trim() !== '') || 
                (exp.role && exp.role.trim() !== '') || 
                hasMeaningfulText(exp.description)
            );
            
            if (resumeData.additional) {
                if (!hasMeaningfulText(resumeData.additional.certifications)) resumeData.additional.certifications = '';
                if (!hasMeaningfulText(resumeData.additional.hobbies)) resumeData.additional.hobbies = '';
                if (!hasMeaningfulText(resumeData.additional.awardsAndActivities)) resumeData.additional.awardsAndActivities = '';
                if (resumeData.additional.languages) {
                    resumeData.additional.languages = resumeData.additional.languages.filter(l => l && l.trim() !== '');
                }
            }

            if (!hasMeaningfulText(resumeData.summary)) resumeData.summary = '';
            if (resumeData.contact && !hasMeaningfulText(resumeData.contact.summary)) resumeData.contact.summary = '';

            let htmlStr = '';
            const data = resumeData.contact || {};
            const experiences = resumeData.work || [];
            const education = resumeData.education || [];
            const projects = resumeData.projects || [];
            const additionalInfo = resumeData.additional || {};

            if (data.template === '5') {
                htmlStr += `
                    <div class="header">
                        <h1>${escapeHTML(data.fullName || "").toUpperCase()}</h1>
                        <h2>${escapeHTML(data.title || "").toUpperCase()}</h2>
                        <div class="header-line"></div>
                    </div>
                    
                    <div class="t5-container">
`;
                        let leftContent = '';
                        let rightContent = '';
                        let leftColHeight = 0;
                        const MAX_LEFT_HEIGHT = 900; // Estimated max safe height for left column

                        // 1. CONTACT
                        let contactHtml = '';
                        if (data.phone) { contactHtml += `<div class="contact-item"><i class="fas fa-phone contact-icon"></i> <span>${escapeHTML(data.phone)}</span></div>`; leftColHeight += 28; }
                        if (data.email) { contactHtml += `<div class="contact-item"><i class="fas fa-envelope contact-icon"></i> <span>${escapeHTML(data.email)}</span></div>`; leftColHeight += 28; }
                        if (data.city || data.country) { contactHtml += `<div class="contact-item"><i class="fas fa-map-marker-alt contact-icon"></i> <span>${escapeHTML([data.city, data.country].filter(Boolean).join(', '))}</span></div>`; leftColHeight += 28; }
                        if (additionalInfo.website) { contactHtml += `<div class="contact-item"><i class="fas fa-globe contact-icon"></i> <span>${escapeHTML(additionalInfo.website)}</span></div>`; leftColHeight += 28; }
                        if (additionalInfo.linkedin) { contactHtml += `<div class="contact-item"><i class="fab fa-linkedin contact-icon"></i> <span>${escapeHTML(additionalInfo.linkedin)}</span></div>`; leftColHeight += 28; }

                        leftContent += `
                            <div class="section">
                                <div class="section-header">
                                    <div class="icon-circle"><i class="fas fa-id-badge"></i></div>
                                    <h3>CONTACT</h3>
                                </div>
                                ${contactHtml}
                            </div>
                        `;
                        leftColHeight += 60; // base header height

                        // 2. PERSONAL DETAILS (Always Left)
                        const hasPersonal = additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.dob;
                        if (hasPersonal) {
                            leftContent += `
                                <div class="section">
                                    <div class="section-header">
                                        <div class="icon-circle"><i class="fas fa-user"></i></div>
                                        <h3>PERSONAL DETAILS</h3>
                                    </div>
                            `;
                            leftColHeight += 60;
                            if (additionalInfo.nationality) { leftContent += `<div class="contact-item" style="font-size:13px"><i class="fas fa-flag contact-icon" style="font-size:12px;opacity:0.5;"></i> <span><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</span></div>`; leftColHeight += 25; }
                            if (additionalInfo.maritalStatus) { leftContent += `<div class="contact-item" style="font-size:13px"><i class="fas fa-ring contact-icon" style="font-size:12px;opacity:0.5;"></i> <span><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</span></div>`; leftColHeight += 25; }
                            if (additionalInfo.visaStatus) { leftContent += `<div class="contact-item" style="font-size:13px"><i class="fas fa-passport contact-icon" style="font-size:12px;opacity:0.5;"></i> <span><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</span></div>`; leftColHeight += 25; }
                            if (additionalInfo.dob) { leftContent += `<div class="contact-item" style="font-size:13px"><i class="fas fa-calendar-alt contact-icon" style="font-size:12px;opacity:0.5;"></i> <span><strong>DOB:</strong> ${escapeHTML(additionalInfo.dob)}</span></div>`; leftColHeight += 25; }
                            leftContent += `</div>`;
                        }

                        // 3. SKILLS
                        const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                        if (skillsList.length > 0) {
                            leftContent += `
                                <div class="section">
                                    <div class="section-header">
                                        <div class="icon-circle"><i class="fas fa-tools"></i></div>
                                        <h3>SKILLS</h3>
                                    </div>
                                    <ul>
                                        ${skillsList.map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}
                                    </ul>
                                </div>
                            `;
                            leftColHeight += 60 + (skillsList.length * 20);
                        }

                        // 4. LANGUAGES
                        if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                            leftContent += `
                                <div class="section">
                                    <div class="section-header">
                                        <div class="icon-circle"><i class="fas fa-language"></i></div>
                                        <h3>LANGUAGES</h3>
                                    </div>
                                    <ul>
                                        ${additionalInfo.languages.map(l => `<li>${escapeHTML(l)}</li>`).join('')}
                                    </ul>
                                </div>
                            `;
                            leftColHeight += 60 + (additionalInfo.languages.length * 20);
                        }

                        // Reserve space for HOBBIES early (Always left, placed at bottom of left content later)
                        const hasHobbies = additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>';
                        let hobbiesHtml = '';
                        if (hasHobbies) {
                            const hHeight = 60 + (additionalInfo.hobbies.length / 40) * 20;
                            leftColHeight += hHeight; // reserve
                            hobbiesHtml = `
                                <div class="section">
                                    <div class="section-header">
                                        <div class="icon-circle"><i class="fas fa-heart"></i></div>
                                        <h3>HOBBIES</h3>
                                    </div>
                                    <div style="font-size: 13px; color: #000;">${additionalInfo.hobbies}</div>
                                </div>
                            `;
                        }

                        // 5. PROJECTS (Prefer Left, move to Right if no space)
                        let projectsHtmlRight = '';
                        if (projects.length > 0) {
                            let pHeight = 60 + (projects.length * 70);
                            let pHtmlLeft = `
                                    <div class="section">
                                        <div class="section-header">
                                            <div class="icon-circle"><i class="fas fa-project-diagram"></i></div>
                                            <h3>PROJECTS</h3>
                                        </div>
                            `;
                            projects.forEach(p => {
                                pHtmlLeft += `
                                        <div class="project" style="margin-bottom:10px;">
                                            <div class="project-title" style="font-weight:bold;font-size:13px;">${escapeHTML(p.name)}</div>
                                            <div class="project-desc" style="font-size:12px;color:#555;">${p.desc}</div>
                                        </div>
                                `;
                            });
                            pHtmlLeft += `</div>`;

                            if (leftColHeight + pHeight <= MAX_LEFT_HEIGHT) {
                                leftContent += pHtmlLeft;
                                leftColHeight += pHeight;
                            } else {
                                projectsHtmlRight = `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-project-diagram"></i></div>
                                            <h3>PROJECTS</h3>
                                        </div>
                                `;
                                projects.forEach(p => {
                                    projectsHtmlRight += `
                                        <div class="job" style="margin-bottom:15px;">
                                            <span class="job-title" style="font-weight:bold;color:#000;">${escapeHTML(p.name)}</span>
                                            <div class="job-role" style="font-size:13px;color:#555;margin-top:5px;">${p.desc}</div>
                                        </div>
                                    `;
                                });
                                projectsHtmlRight += `</div>`;
                            }
                        }

                        // 6. CERTIFICATIONS (Prefer Left, move to Right if no space)
                        let certsHtmlRight = '';
                        const hasCerts = additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>';
                        if (hasCerts) {
                            let cHeight = 60 + (additionalInfo.certifications.length / 40) * 20;
                            let cLeftHtml = `
                                    <div class="section">
                                        <div class="section-header">
                                            <div class="icon-circle"><i class="fas fa-certificate"></i></div>
                                            <h3>CERTIFICATIONS</h3>
                                        </div>
                                        <div style="font-size: 13px; color: #000;">${additionalInfo.certifications}</div>
                                    </div>
                            `;
                            if (leftColHeight + cHeight <= MAX_LEFT_HEIGHT) {
                                leftContent += cLeftHtml;
                                leftColHeight += cHeight;
                            } else {
                                certsHtmlRight = `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-certificate"></i></div>
                                            <h3>CERTIFICATIONS</h3>
                                        </div>
                                        <div style="font-size: 13px; color: #444; line-height: 1.6;">${additionalInfo.certifications}</div>
                                    </div>
                                `;
                            }
                        }

                        // Append Hobbies at the bottom of left content if it exists
                        if (hasHobbies) {
                            leftContent += hobbiesHtml;
                        }

                        // Construct RIGHT COLUMN
                        const summaryText = resumeData.summary || data.summary || "";
                        if (summaryText.trim() && summaryText !== '<br>') {
                            rightContent += `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-user-tie"></i></div>
                                            <h3>PROFILE</h3>
                                        </div>
                                        <div style="font-size: 13px; line-height: 1.6; color: #444;">${summaryText}</div>
                                    </div>
                            `;
                        }

                        const workExpArray = resumeData.workExperience || resumeData.work || [];
                        const internExpArray = resumeData.internshipExperience || [];
                        if (resumeData.experienceType !== 'fresher') {
                            if (workExpArray.length > 0) {
                                rightContent += `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-briefcase"></i></div>
                                            <h3>WORK EXPERIENCE</h3>
                                        </div>
                                `;
                                for (let i = 0; i < workExpArray.length; i++) {
                                    const exp = workExpArray[i];
                                    if (!exp.company.trim()) continue;
                                    let durationStr = `${exp.startYear} - ${exp.current ? 'PRESENT' : exp.endYear}`;
                                    rightContent += `
                                        <div class="job">
                                            <span class="job-title">${escapeHTML(exp.company)}</span>
                                            <span class="job-date">${escapeHTML(durationStr)}</span>
                                            <div class="job-role">${escapeHTML(exp.role)}</div>
                                            ${exp.description ? `<div style="margin-top: 5px; font-size: 13px;">${exp.description}</div>` : ''}
                                        </div>
                                    `;
                                }
                                rightContent += `</div>`;
                            }

                            if (internExpArray.length > 0) {
                                rightContent += `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-laptop-code"></i></div>
                                            <h3>INTERNSHIP EXPERIENCE</h3>
                                        </div>
                                `;
                                for (let i = 0; i < internExpArray.length; i++) {
                                    const exp = internExpArray[i];
                                    if (!exp.company.trim()) continue;
                                    let durationStr = `${exp.startYear} - ${exp.current ? 'PRESENT' : exp.endYear}`;
                                    rightContent += `
                                        <div class="job">
                                            <span class="job-title">${escapeHTML(exp.company)}</span>
                                            <span class="job-date">${escapeHTML(durationStr)}</span>
                                            <div class="job-role">${escapeHTML(exp.role)}</div>
                                            ${exp.description ? `<div style="margin-top: 5px; font-size: 13px;">${exp.description}</div>` : ''}
                                        </div>
                                    `;
                                }
                                rightContent += `</div>`;
                            }
                        }

                        if (education.length > 0) {
                            rightContent += `
                                    <div class="block">
                                        <div class="block-header">
                                            <div class="icon-circle"><i class="fas fa-graduation-cap"></i></div>
                                            <h3>EDUCATION</h3>
                                        </div>
                            `;
                            for (let i = 0; i < education.length; i++) {
                                const edu = education[i];
                                if (!edu.school.trim()) continue;
                                let durationStr = `${edu.gradYear}`;
                                rightContent += `
                                        <div class="job">
                                            <span class="job-title">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</span>
                                            <span class="job-date">${escapeHTML(durationStr)}</span>
                                            <div class="job-role">${escapeHTML(edu.school)}</div>
                                        </div>
                                `;
                            }
                            rightContent += `</div>`;
                        }

                        // Add overflow blocks to right column
                        if (certsHtmlRight) rightContent += certsHtmlRight;
                        if (projectsHtmlRight) rightContent += projectsHtmlRight;

                        htmlStr += `
                            <!-- LEFT -->
                            <div class="left">
                                ${leftContent}
                            </div>
                            <!-- RIGHT -->
                            <div class="right">
                                <div class="timeline"></div>
                                ${rightContent}
                            </div>
                        </div>
                    `;
            } else if (data.template === '6') {
                htmlStr += `
                    <div class="name">${escapeHTML(data.fullName || "").toUpperCase()}</div>
                    <div class="title">${escapeHTML(data.title || "")}</div>
                    <div class="contact">
                `;
                let contactItems = [];
                if (data.email) contactItems.push(`<span>${escapeHTML(data.email)}</span>`);
                if (data.phone) contactItems.push(`<span>${escapeHTML(data.phone)}</span>`);
                if (data.city || data.country) contactItems.push(`<span>${escapeHTML([data.city, data.country].filter(Boolean).join(', '))}</span>`);
                if (additionalInfo.website) contactItems.push(`<span>${escapeHTML(additionalInfo.website)}</span>`);
                if (additionalInfo.linkedin) contactItems.push(`<span>${escapeHTML(additionalInfo.linkedin)}</span>`);
                htmlStr += contactItems.join(' | ') + `
                    </div>
                    <div class="divider"></div>
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                    <div class="section-title">SUMMARY</div>
                    <div class="summary">${summaryText}</div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `<div class="section-title">WORK EXPERIENCE</div>`;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}, ${escapeHTML(exp.company)}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                    }

                    if (internExpArray.length > 0) {
                        htmlStr += `<div class="section-title">INTERNSHIP EXPERIENCE</div>`;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}, ${escapeHTML(exp.company)}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                    }
                }

                if (education.length > 0) {
                    htmlStr += `<div class="section-title">EDUCATION</div>`;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        htmlStr += `
                            <div class="edu">
                                <div class="edu-header">
                                    <div>${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                                    <div>${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</div>
                                </div>
                                <div class="edu-sub">${escapeHTML(edu.school)}, ${escapeHTML(edu.location)}</div>
                                ${edu.coursework.trim() ? `<div class="job-desc"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                            </div>
                        `;
                    }
                }

                if (projects.length > 0) {
                    htmlStr += `<div class="section-title">PROJECTS</div>`;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div>${escapeHTML(p.name)}</div>
                                    ${p.link ? `<div class="date"><a href="${escapeHTML(p.link)}" style="text-decoration:none; color:inherit;">${escapeHTML(p.link)}</a></div>` : ''}
                                </div>
                                ${p.desc ? `<div class="job-desc">${p.desc}</div>` : ''}
                            </div>
                        `;
                    }
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `<div class="section-title">KEY SKILLS</div>
                                <div class="skills-grid">`;
                    
                    const col1 = [], col2 = [], col3 = [];
                    skillsList.forEach((s, idx) => {
                        if (idx % 3 === 0) col1.push(s);
                        else if (idx % 3 === 1) col2.push(s);
                        else col3.push(s);
                    });

                    htmlStr += `<ul>`; col1.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; }); htmlStr += `</ul>`;
                    htmlStr += `<ul>`; col2.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; }); htmlStr += `</ul>`;
                    htmlStr += `<ul>`; col3.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; }); htmlStr += `</ul>`;
                    htmlStr += `</div>`;
                }

                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    htmlStr += `<div class="section-title">CERTIFICATIONS</div>
                                <div class="summary">${additionalInfo.certifications}</div>`;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `<div class="section-title">LANGUAGES</div>
                                <div class="skills-grid">
                                    <ul>`;
                    additionalInfo.languages.forEach(l => { htmlStr += `<li>${escapeHTML(l)}</li>`; });
                    htmlStr += `</ul></div>`;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    htmlStr += `<div class="section-title">HOBBIES</div>
                                <div class="summary">${additionalInfo.hobbies}</div>`;
                }

                if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    htmlStr += `<div class="section-title">PERSONAL DETAILS</div>
                                <div class="summary" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; list-style:none;">`;
                    if (additionalInfo.nationality) htmlStr += `<div><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>`;
                    if (additionalInfo.maritalStatus) htmlStr += `<div><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>`;
                    if (additionalInfo.visaStatus) htmlStr += `<div><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>`;
                    if (additionalInfo.dob) htmlStr += `<div><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>`;
                    htmlStr += `</div>`;
                }
            } else if (data.template === '7') {
                htmlStr += `
                    <div class="header">
                        <div class="name">${escapeHTML(data.fullName || "").toUpperCase()}</div>
                        <div class="contact">
                `;
                
                let contactItems = [];
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));
                htmlStr += contactItems.join(' &nbsp;|&nbsp; ') + `
                        </div>
                    </div>
                    <div class="content">
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">SUMMARY</div>
                            <div class="section-line"></div>
                            <div class="summary">${summaryText}</div>
                        </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <div class="section">
                                <div class="section-title">WORK EXPERIENCE</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-title">${escapeHTML(exp.role)}</div>
                                    <div class="job-sub">${escapeHTML(exp.company)} &nbsp;|&nbsp; ${escapeHTML(durationStr)}</div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }

                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <div class="section">
                                <div class="section-title">INTERNSHIP EXPERIENCE</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-title">${escapeHTML(exp.role)}</div>
                                    <div class="job-sub">${escapeHTML(exp.company)} &nbsp;|&nbsp; ${escapeHTML(durationStr)}</div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                if (projects.length > 0) {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">PROJECTS</div>
                            <div class="section-line"></div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="job">
                                <div class="job-title">${escapeHTML(p.name)}</div>
                                ${p.link ? `<div class="job-sub"><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                                ${p.desc ? `<div class="job-desc">${p.desc}</div>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                if (education.length > 0) {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">EDUCATION</div>
                            <div class="section-line"></div>
                            <div class="grid-2">
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        htmlStr += `
                            <div>
                                <div class="edu-block">
                                    <div class="edu-title">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                                    <div class="edu-sub">${escapeHTML(edu.school)}, ${escapeHTML(edu.location)}</div>
                                    ${edu.coursework.trim() ? `<div class="job-desc" style="font-size:14px; margin:3px 0;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                                    <div class="edu-date">${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</div>
                                </div>
                            </div>
                        `;
                    }
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                htmlStr += `<div class="grid-2">`; 

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">SKILLS</div>
                            <div class="section-line"></div>
                            <div class="two-col-list">
                    `;
                    const col1 = [], col2 = [];
                    skillsList.forEach((s, idx) => {
                        if (idx % 2 === 0) col1.push(s);
                        else col2.push(s);
                    });

                    htmlStr += `<ul>`; col1.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; }); htmlStr += `</ul>`;
                    htmlStr += `<ul>`; col2.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; }); htmlStr += `</ul>`;
                    
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">CERTIFICATIONS</div>
                            <div class="section-line"></div>
                            <div class="summary">${additionalInfo.certifications}</div>
                        </div>
                    `;
                }
                
                htmlStr += `</div>`; 

                htmlStr += `<div class="grid-2">`;

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">LANGUAGES</div>
                            <div class="section-line"></div>
                            <div class="two-col-list">
                                <ul>
                    `;
                    additionalInfo.languages.forEach(l => { htmlStr += `<li>${escapeHTML(l)}</li>`; });
                    htmlStr += `
                                </ul>
                            </div>
                        </div>
                    `;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">HOBBIES</div>
                            <div class="section-line"></div>
                            <div class="summary">${additionalInfo.hobbies}</div>
                        </div>
                    `;
                }

                htmlStr += `</div>`; 

                if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">PERSONAL DETAILS</div>
                            <div class="section-line"></div>
                            <div class="grid-2">
                    `;
                    if (additionalInfo.nationality) htmlStr += `<div style="font-size:14px;"><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>`;
                    if (additionalInfo.maritalStatus) htmlStr += `<div style="font-size:14px;"><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>`;
                    if (additionalInfo.visaStatus) htmlStr += `<div style="font-size:14px;"><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>`;
                    if (additionalInfo.dob) htmlStr += `<div style="font-size:14px;"><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>`;
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                htmlStr += `</div>`; 
            } else if (data.template === '8') {
                const nameStr = data.fullName || "";
                let init1 = "", init2 = "";
                const names = nameStr.trim().split(/\s+/);
                if (names.length > 0) init1 = names[0].charAt(0).toUpperCase();
                if (names.length > 1) init2 = names[names.length - 1].charAt(0).toUpperCase();
                else if (names[0] && names[0].length > 1) init2 = names[0].charAt(1).toUpperCase();
                const avatarStr = escapeHTML(init1 + init2);

                htmlStr += `
                    <div class="top">
                        <div class="avatar">${avatarStr}</div>
                        <div class="name-block">
                            <div class="name">${escapeHTML(nameStr).toUpperCase()}</div>
                            <div class="role">${escapeHTML(data.title || "")}</div>
                        </div>
                    </div>
                    <div class="main">
                        <div> <!-- LEFT COLUMN -->
                `;

                let contactItems = [];
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));

                if (contactItems.length > 0) {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Contact</div>
                    `;
                    contactItems.forEach(item => {
                        htmlStr += `<div class="icon-text">${item}</div>`;
                    });
                    htmlStr += `</div>`;
                }

                if (education.length > 0) {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Education</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        htmlStr += `
                            <div class="edu-block">
                                <div class="edu-year">${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</div>
                                <div class="edu-title">${escapeHTML(edu.school)}</div>
                                <div class="edu-sub">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}<br>${escapeHTML(edu.location)}</div>
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                        <div class="left-section skills">
                            <div class="section-title">Skills</div>
                            <ul>
                    `;
                    skillsList.forEach(s => { htmlStr += `<li>${escapeHTML(s.trim())}</li>`; });
                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Language</div>
                            <ul>
                    `;
                    additionalInfo.languages.forEach(l => { htmlStr += `<li>${escapeHTML(l)}</li>`; });
                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }

                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Certifications</div>
                            <div class="text">${additionalInfo.certifications}</div>
                        </div>
                    `;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Hobbies</div>
                            <div class="text">${additionalInfo.hobbies}</div>
                        </div>
                    `;
                }

                if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Personal Details</div>
                            <div style="font-size:14px; line-height:1.6; color:#444;">
                    `;
                    if (additionalInfo.nationality) htmlStr += `<div><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>`;
                    if (additionalInfo.maritalStatus) htmlStr += `<div><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>`;
                    if (additionalInfo.visaStatus) htmlStr += `<div><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>`;
                    if (additionalInfo.dob) htmlStr += `<div><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>`;
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                htmlStr += `
                        </div>
                        <div> <!-- RIGHT COLUMN -->
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">About Me</div>
                            <div class="text">${summaryText}</div>
                        </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <div class="left-section">
                                <div class="section-title">Experience</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="exp-block">
                                    <div class="exp-date">${escapeHTML(durationStr)}</div>
                                    <div class="exp-company">${escapeHTML(exp.company)}</div>
                                    <div class="exp-role">${escapeHTML(exp.role)}</div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }

                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <div class="left-section">
                                <div class="section-title">Internship Experience</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="exp-block">
                                    <div class="exp-date">${escapeHTML(durationStr)}</div>
                                    <div class="exp-company">${escapeHTML(exp.company)}</div>
                                    <div class="exp-role">${escapeHTML(exp.role)}</div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                if (projects.length > 0) {
                    htmlStr += `
                        <div class="left-section">
                            <div class="section-title">Projects</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="exp-block">
                                <div class="exp-role" style="margin-top:0;">${escapeHTML(p.name)}</div>
                                ${p.link ? `<div class="exp-date"><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                                ${p.desc ? `<div class="job-desc" style="margin-top:5px;">${p.desc}</div>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                htmlStr += `
                        </div>
                    </div>
                `;
            } else if (data.template === '9') {
                const nameStr = data.fullName || "Your Name";
                const summaryText = resumeData.summary || data.summary || "";
                
                htmlStr += `
                    <!-- TOP -->
                    <div class="top">
                        <div>
                            <div class="name">${escapeHTML(nameStr)}</div>
                            ${data.title ? `<div class="tagline">${escapeHTML(data.title)}</div>` : ''}
                        </div>

                        <div class="contact-info">
                            ${data.phone ? `<strong>${escapeHTML(data.phone)}</strong><br>` : ''}
                            ${data.email ? `<a href="mailto:${escapeHTML(data.email)}" style="text-decoration:none;">${escapeHTML(data.email)}</a><br>` : ''}
                            ${[data.city, data.country].filter(Boolean).join(', ') ? `${escapeHTML([data.city, data.country].filter(Boolean).join(', '))}<br>` : ''}
                `;
                if (additionalInfo.website) {
                    htmlStr += `<div class="bold"><a href="${escapeHTML(additionalInfo.website)}" style="text-decoration:none; color:inherit;">${escapeHTML(additionalInfo.website)}</a></div>`;
                }
                if (additionalInfo.linkedin) {
                    htmlStr += `<div class="bold"><a href="${escapeHTML(additionalInfo.linkedin)}" style="text-decoration:none; color:inherit;">${escapeHTML(additionalInfo.linkedin)}</a></div>`;
                }
                
                htmlStr += `
                        </div>
                    </div>

                    <!-- MAIN -->
                    <div class="main-layout">
                        <!-- LEFT -->
                        <div>
                `;
                
                let leftContent = '';
                let rightContent = '';
                let leftColHeight = 0;
                const MAX_LEFT_HEIGHT = 800; // Approximated max height for left column

                if (summaryText.trim() && summaryText !== '<br>') {
                    leftContent += `
                            <div class="section">
                                <div class="section-title">SUMMARY</div>
                                <div class="item-desc">${summaryText}</div>
                            </div>
                    `;
                    leftColHeight += 40 + (summaryText.length / 50) * 20;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        leftContent += `
                            <div class="section">
                                <div class="section-title">EXPERIENCE</div>
                        `;
                        leftColHeight += 40;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'PRESENT' : exp.endMonth + ' ' + exp.endYear}`;
                            leftContent += `
                                <div class="item">
                                    <div class="item-title">${escapeHTML(exp.company)}${exp.location ? `, ${escapeHTML(exp.location)}` : ''} &mdash; <i>${escapeHTML(exp.role)}</i></div>
                                    <div class="item-sub">${escapeHTML(durationStr)}</div>
                                    ${exp.description ? `<div class="item-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                            leftColHeight += 60 + (exp.description ? (exp.description.length / 50) * 20 : 0);
                        }
                        leftContent += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        leftContent += `
                            <div class="section">
                                <div class="section-title">INTERNSHIP EXPERIENCE</div>
                        `;
                        leftColHeight += 40;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'PRESENT' : exp.endMonth + ' ' + exp.endYear}`;
                            leftContent += `
                                <div class="item">
                                    <div class="item-title">${escapeHTML(exp.company)}${exp.location ? `, ${escapeHTML(exp.location)}` : ''} &mdash; <i>${escapeHTML(exp.role)}</i></div>
                                    <div class="item-sub">${escapeHTML(durationStr)}</div>
                                    ${exp.description ? `<div class="item-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                            leftColHeight += 60 + (exp.description ? (exp.description.length / 50) * 20 : 0);
                        }
                        leftContent += `</div>`;
                    }
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    leftContent += `
                            <div class="section">
                                <div class="section-title">EDUCATION</div>
                    `;
                    leftColHeight += 40;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        let durationStr = `${edu.gradMonth} ${edu.gradYear}`;
                        leftContent += `
                                <div class="item">
                                    <div class="item-title">${escapeHTML(edu.school)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''} &mdash; <i>${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</i></div>
                                    <div class="item-sub">${escapeHTML(durationStr)}</div>
                                    ${edu.coursework.trim() ? `<div class="item-desc"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                                </div>
                        `;
                        leftColHeight += 50 + (edu.coursework.trim() ? (edu.coursework.length / 50) * 20 : 0);
                    }
                    leftContent += `</div>`;
                }

                let projectsHtmlRight = '';
                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    let pHeight = 40;
                    let pContent = `
                            <div class="section">
                                <div class="section-title">PROJECTS</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        pContent += `
                                <div class="item">
                                    <div class="item-title">${escapeHTML(p.name)} ${p.link ? `&mdash; <i><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></i>` : ''}</div>
                                    ${p.desc ? `<div class="item-desc" style="margin-top: 4px;">${p.desc}</div>` : ''}
                                </div>
                        `;
                        pHeight += 40 + (p.desc ? (p.desc.length / 50) * 20 : 0);
                    }
                    pContent += `</div>`;

                    if (leftColHeight + pHeight <= MAX_LEFT_HEIGHT) {
                        leftContent += pContent;
                        leftColHeight += pHeight;
                    } else {
                        projectsHtmlRight = pContent;
                    }
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    rightContent += `
                            <div class="section">
                                <div class="section-title">SKILLS</div>
                                <ul>
                                    ${skillsList.map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}
                                </ul>
                            </div>
                    `;
                }

                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    rightContent += `
                            <div class="section">
                                <div class="section-title">CERTIFICATIONS</div>
                                <div class="item-desc">${additionalInfo.certifications}</div>
                            </div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    rightContent += `
                            <div class="section">
                                <div class="section-title">LANGUAGES</div>
                                <ul>
                                    ${additionalInfo.languages.map(l => `<li>${escapeHTML(l)}</li>`).join('')}
                                </ul>
                            </div>
                    `;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    rightContent += `
                            <div class="section">
                                <div class="section-title">HOBBIES</div>
                                <div class="item-desc">${additionalInfo.hobbies}</div>
                            </div>
                    `;
                }

                if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    rightContent += `
                            <div class="section">
                                <div class="section-title">PERSONAL DETAILS</div>
                                <div class="item-desc">
                                    ${additionalInfo.nationality ? `<div><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>` : ''}
                                    ${additionalInfo.maritalStatus ? `<div><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>` : ''}
                                    ${additionalInfo.visaStatus ? `<div><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>` : ''}
                                    ${additionalInfo.dob ? `<div><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>` : ''}
                                </div>
                            </div>
                    `;
                }

                // Add Projects to right if needed
                if (projectsHtmlRight) rightContent += projectsHtmlRight;

                htmlStr += `
                        ${leftContent}
                        </div>
                        
                        <!-- RIGHT -->
                        <div class="sidebar">
                            ${rightContent}
                        </div>
                    </div>
                `;
            } else if (data.template === '10') {
                const nameStr = data.fullName || "Your Name";
                const summaryText = resumeData.summary || data.summary || "";
                
                htmlStr += `
                    <!-- HEADER -->
                    <div class="header">
                        <div class="name">${escapeHTML(nameStr)}</div>
                        <div class="contact">
                `;
                
                let contactItems = [];
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));
                htmlStr += contactItems.join(' &bull; ') + `
                        </div>
                    </div>
                `;

                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                    <div class="divider"></div>
                    <!-- SUMMARY -->
                    <div class="section">
                        <div class="section-title">SUMMARY</div>
                        <div class="summary">${summaryText}</div>
                    </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <div class="divider"></div>
                            <!-- EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">WORK EXPERIENCE</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div class="company">${escapeHTML(exp.role)}${exp.company ? `, ${escapeHTML(exp.company)}` : ''}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <div class="divider"></div>
                            <!-- INTERNSHIP EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">INTERNSHIP EXPERIENCE</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div class="company">${escapeHTML(exp.role)}${exp.company ? `, ${escapeHTML(exp.company)}` : ''}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <div class="divider"></div>
                        <!-- EDUCATION -->
                        <div class="section">
                            <div class="section-title">EDUCATION</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        let durationStr = `${edu.gradMonth} ${edu.gradYear}`;
                        htmlStr += `
                            <div class="edu">
                                <div class="edu-header">
                                    <div class="company">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                                    <div class="date">${escapeHTML(durationStr)}</div>
                                </div>
                                <div class="sub">${escapeHTML(edu.school)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                                ${edu.coursework.trim() ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</li></ul>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                        <div class="divider"></div>
                        <!-- PROJECTS -->
                        <div class="section">
                            <div class="section-title">PROJECTS</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div class="company">${escapeHTML(p.name)}</div>
                                    ${p.link ? `<div class="date"><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                                </div>
                                ${p.desc ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">${p.desc.replace(/<br>/g, '</li><li style="font-size: 14px; margin-bottom: 5px; line-height: 1.5;">')}</li></ul>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                
                if (skillsList.length > 0 || (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') || (additionalInfo.languages && additionalInfo.languages.length > 0) || (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    
                    htmlStr += `
                        <div class="divider"></div>
                        <!-- ADDITIONAL -->
                        <div class="section">
                            <div class="section-title">ADDITIONAL INFORMATION</div>
                            <ul class="additional">
                    `;

                    if (skillsList.length > 0) {
                        htmlStr += `<li><strong>Technical Skills:</strong> ${skillsList.map(s => escapeHTML(s.trim())).join(', ')}</li>`;
                    }
                    
                    if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                        htmlStr += `<li><strong>Languages:</strong> ${additionalInfo.languages.map(l => escapeHTML(l)).join(', ')}</li>`;
                    }

                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                        htmlStr += `<li><strong>Certifications:</strong> <span class="additional-block">${inlineHTML(additionalInfo.certifications)}</span></li>`;
                    }

                    if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                        htmlStr += `<li><strong>Hobbies:</strong> <span class="additional-block">${inlineHTML(additionalInfo.hobbies)}</span></li>`;
                    }
                    
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities.trim() !== '' && additionalInfo.awardsAndActivities !== '<br>') {
                        htmlStr += `<li><strong>Awards/Activities:</strong> <span class="additional-block">${inlineHTML(additionalInfo.awardsAndActivities)}</span></li>`;
                    }

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`Date of Birth: ${escapeHTML(additionalInfo.dob)}`);
                        htmlStr += `<li><strong>Personal Details:</strong> ${pdText.join(' | ')}</li>`;
                    }

                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }
            } else if (data.template === '11') {
                const nameStr = data.fullName || "Your Name";
                const summaryText = resumeData.summary || data.summary || "";
                
                htmlStr += `
                    <!-- HEADER -->
                    <div class="name">${escapeHTML(nameStr)}</div>
                    ${data.title ? `<div class="role">${escapeHTML(data.title)}</div>` : ''}
                    <div class="contact">
                `;
                
                let contactItems = [];
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));
                htmlStr += contactItems.join(' | ') + `
                    </div>
                `;

                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                    <!-- SUMMARY -->
                    <div class="section">
                        <div class="section-title">SUMMARY</div>
                        <div class="text">${summaryText}</div>
                    </div>
                    `;
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                    <!-- TECHNICAL SKILLS -->
                    <div class="section">
                        <div class="section-title">TECHNICAL SKILLS</div>
                        <div class="skills-grid">
                    `;
                    const col1 = [], col2 = [], col3 = [];
                    skillsList.forEach((s, idx) => {
                        if (idx % 3 === 0) col1.push(s);
                        else if (idx % 3 === 1) col2.push(s);
                        else col3.push(s);
                    });
                    
                    if(col1.length > 0) htmlStr += `<div>${col1.map(s => escapeHTML(s.trim())).join('<br>')}</div>`;
                    if(col2.length > 0) htmlStr += `<div>${col2.map(s => escapeHTML(s.trim())).join('<br>')}</div>`;
                    if(col3.length > 0) htmlStr += `<div>${col3.map(s => escapeHTML(s.trim())).join('<br>')}</div>`;

                    htmlStr += `
                        </div>
                    </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <!-- EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">PROFESSIONAL EXPERIENCE</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}${exp.company ? `, ${escapeHTML(exp.company)}` : ''}</div>
                                        <div>${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 5px 0 0 16px; padding: 0;"><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <!-- INTERNSHIP EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">INTERNSHIP EXPERIENCE</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}${exp.company ? `, ${escapeHTML(exp.company)}` : ''}</div>
                                        <div>${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 5px 0 0 16px; padding: 0;"><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <!-- EDUCATION -->
                        <div class="section">
                            <div class="section-title">EDUCATION</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        let durationStr = `${edu.gradMonth} ${edu.gradYear}`;
                        htmlStr += `
                            <div class="edu">
                                <div class="edu-header">
                                    <div>${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                                    <div>${escapeHTML(durationStr)}</div>
                                </div>
                                <div class="sub">${escapeHTML(edu.school)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                                ${edu.coursework.trim() ? `<ul style="margin: 5px 0 0 16px; padding: 0;"><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</li></ul>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                        <!-- PROJECTS -->
                        <div class="section">
                            <div class="section-title">PROJECTS</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div>${escapeHTML(p.name)}</div>
                                    ${p.link ? `<div><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                                </div>
                                ${p.desc ? `<ul style="margin: 5px 0 0 16px; padding: 0;"><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">${p.desc.replace(/<br>/g, '</li><li style="font-size: 12.5px; margin-bottom: 3px; line-height: 1.4;">')}</li></ul>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                if ((additionalInfo.certifications && additionalInfo.certifications !== '') || (additionalInfo.languages && additionalInfo.languages.length > 0) || (additionalInfo.hobbies && additionalInfo.hobbies !== '') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.awardsAndActivities) {
                    
                    htmlStr += `
                        <!-- ADDITIONAL -->
                        <div class="section">
                            <div class="section-title">ADDITIONAL INFORMATION</div>
                            <ul class="additional">
                    `;
                    
                    if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                        htmlStr += `<li><strong>Languages:</strong> ${additionalInfo.languages.map(l => escapeHTML(l)).join(', ')}</li>`;
                    }

                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.certifications && additionalInfo.certifications !== '') {
                        htmlStr += `<li><strong>Certifications:</strong> <span class="additional-block">${inlineHTML(additionalInfo.certifications)}</span></li>`;
                    }

                    if (additionalInfo.hobbies && additionalInfo.hobbies !== '') {
                        htmlStr += `<li><strong>Hobbies:</strong> <span class="additional-block">${inlineHTML(additionalInfo.hobbies)}</span></li>`;
                    }
                    
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities !== '') {
                        htmlStr += `<li><strong>Awards/Activities:</strong> <span class="additional-block">${inlineHTML(additionalInfo.awardsAndActivities)}</span></li>`;
                    }

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`Date of Birth: ${escapeHTML(additionalInfo.dob)}`);
                        htmlStr += `<li><strong>Personal Details:</strong> ${pdText.join(' | ')}</li>`;
                    }

                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }
            } else if (data.template === '12') {
                const nameStr = data.fullName || "Your Name";
                const titleStr = data.title || "";
                
                htmlStr += `
                    <!-- HEADER -->
                    <div class="header">
                        <div>
                            <div class="name">${escapeHTML(nameStr)}</div>
                            ${titleStr ? `<div class="role">${escapeHTML(titleStr)}</div>` : ''}
                        </div>

                        <div class="header-right">
                `;
                
                let contactItems = [];
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));
                
                htmlStr += contactItems.join('<br>') + `
                        </div>
                    </div>
                `;

                const summaryText = resumeData.summary || data.summary || "";
                
                htmlStr += `
                    <!-- CONTENT -->
                    <div class="content">
                `;

                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <!-- ABOUT ME -->
                        <div class="section">
                            <div class="section-title">About Me</div>
                            <div class="section-line"></div>
                            <div class="text">${summaryText}</div>
                        </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <!-- WORK EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">Work Experience</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}${exp.company ? ` | ${escapeHTML(exp.company)}` : ''}</div>
                                        <div>${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <!-- INTERNSHIP EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">Internship Experience</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.role)}${exp.company ? ` | ${escapeHTML(exp.company)}` : ''}</div>
                                        <div>${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">${exp.description.replace(/<br>/g, '</li><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">')}</li></ul>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                        <!-- PROJECTS -->
                        <div class="section">
                            <div class="section-title">Projects</div>
                            <div class="section-line"></div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div>${escapeHTML(p.name)}</div>
                                    ${p.link ? `<div><a href="${escapeHTML(p.link)}" style="color:inherit; text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                                </div>
                                ${p.desc ? `<ul style="margin: 6px 0 0 18px; padding: 0;"><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">${p.desc.replace(/<br>/g, '</li><li style="font-size: 13px; margin-bottom: 4px; line-height: 1.5;">')}</li></ul>` : ''}
                            </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <div class="divider"></div>
                        <!-- EDUCATION -->
                        <div class="section" style="margin-top:20px;">
                            <div class="section-title">Education</div>
                            <div class="section-line"></div>
                            
                            <div class="education-grid">
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        let durationStr = `${edu.gradMonth} ${edu.gradYear}`;
                        htmlStr += `
                                <div class="edu-item">
                                    <div class="edu-year">${escapeHTML(durationStr)}</div>
                                    <div class="edu-title">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                                    <div class="edu-sub">${escapeHTML(edu.school)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                                    ${edu.coursework.trim() ? `<ul style="margin: 6px 0 0 14px; padding: 0;"><li style="font-size: 12px; margin-bottom: 3px; line-height: 1.4;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</li></ul>` : ''}
                                </div>
                        `;
                    }
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                htmlStr += `
                        <div class="divider"></div>
                        <!-- BOTTOM SECTIONS -->
                        <div class="bottom-grid" style="margin-top:20px;">
                `;

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                            <!-- EXPERTISE (SKILLS) -->
                            <div class="skills">
                                <div class="section-title">SKILLS</div>
                                <div class="section-line"></div>
                                <ul>
                    `;
                    skillsList.forEach(s => {
                        htmlStr += `<li>${escapeHTML(s.trim())}</li>`;
                    });
                    htmlStr += `
                                </ul>
                            </div>
                    `;
                } else {
                    htmlStr += `<div></div>`;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                            <!-- LANGUAGE -->
                            <div class="skills">
                                <div class="section-title">Language</div>
                                <div class="section-line"></div>
                                <ul>
                    `;
                    additionalInfo.languages.forEach(l => {
                        htmlStr += `<li>${escapeHTML(l)}</li>`;
                    });
                    htmlStr += `
                                </ul>
                            </div>
                    `;
                } else {
                    htmlStr += `<div></div>`;
                }
                
                htmlStr += `</div>`; // .bottom-grid

                if ((additionalInfo.certifications && additionalInfo.certifications !== '') || (additionalInfo.hobbies && additionalInfo.hobbies !== '') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.awardsAndActivities) {
                    
                    htmlStr += `
                        <div class="divider"></div>
                        <!-- ADDITIONAL -->
                        <div class="section" style="margin-top:20px;">
                            <div class="section-title">Additional Information</div>
                            <div class="section-line"></div>
                            <ul class="text" style="list-style-type: disc; margin: 10px 0 0 18px; padding: 0;">
                    `;
                    
                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.certifications && additionalInfo.certifications !== '') {
                        htmlStr += `<li style="margin-bottom:6px;"><strong>Certifications:</strong> ${inlineHTML(additionalInfo.certifications)}</li>`;
                    }

                    if (additionalInfo.hobbies && additionalInfo.hobbies !== '') {
                        htmlStr += `<li style="margin-bottom:6px;"><strong>Hobbies:</strong> ${inlineHTML(additionalInfo.hobbies)}</li>`;
                    }
                    
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities !== '') {
                        htmlStr += `<li style="margin-bottom:6px;"><strong>Awards/Activities:</strong> ${inlineHTML(additionalInfo.awardsAndActivities)}</li>`;
                    }

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`Date of Birth: ${escapeHTML(additionalInfo.dob)}`);
                        htmlStr += `<li style="margin-bottom:6px;"><strong>Personal Details:</strong> ${pdText.join(' | ')}</li>`;
                    }

                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }

                htmlStr += `
                    </div> <!-- End .content -->
                `;
            } else if (data.template === '13') {
                const nameStr = data.fullName || "Your Name";
                const titleStr = data.title || "";
                
                htmlStr += `
                    <div class="top-strip"></div>
                    <!-- HEADER -->
                    <div class="header">
                        <div>
                            <div class="name">${escapeHTML(nameStr)}</div>
                            ${titleStr ? `<div class="role">${escapeHTML(titleStr)}</div>` : ''}
                        </div>

                        <div class="contact">
                `;
                
                let contactItems = [];
                if (data.phone) contactItems.push(escapeHTML(data.phone));
                if (data.city || data.country) contactItems.push(escapeHTML([data.city, data.country].filter(Boolean).join(', ')));
                if (additionalInfo.website) contactItems.push(escapeHTML(additionalInfo.website));
                if (data.email) contactItems.push(escapeHTML(data.email));
                if (additionalInfo.linkedin) contactItems.push(escapeHTML(additionalInfo.linkedin));
                
                htmlStr += contactItems.join('<br>') + `
                        </div>
                    </div>
                    <div class="divider"></div>
                `;

                const summaryText = resumeData.summary || data.summary || "";
                
                htmlStr += `
                    <!-- ABOUT -->
                    <div class="content">
                `;

                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <div class="section">
                            <div class="section-title">About Me</div>
                            <div class="text">${summaryText}</div>
                        </div>
                        <div class="divider"></div>
                    `;
                }

                htmlStr += `
                        <!-- MAIN -->
                        <div class="main">
                            <!-- LEFT -->
                            <div class="left">
                `;

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                                <div class="section">
                                    <div class="section-title">Education</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        let durationStr = `(${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)})`;
                        htmlStr += `
                                    <div class="edu-item">
                                        <div class="edu-year">${durationStr}</div>
                                        <div class="edu-title">${escapeHTML(edu.school)}</div>
                                        <div class="edu-sub">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                                    </div>
                        `;
                    }
                    htmlStr += `
                                </div>
                                <div class="divider"></div>
                    `;
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                                <div class="section skills">
                                    <div class="section-title">Skills</div>
                                    <ul>
                    `;
                    skillsList.forEach(s => {
                        htmlStr += `<li>${escapeHTML(s.trim())}</li>`;
                    });
                    htmlStr += `
                                    </ul>
                                </div>
                                <div class="divider"></div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                                <div class="section">
                                    <div class="section-title">Languages</div>
                                    <div class="text">${additionalInfo.languages.map(l => escapeHTML(l)).join('<br>')}</div>
                                </div>
                                <div class="divider"></div>
                    `;
                }

                if ((additionalInfo.certifications && additionalInfo.certifications !== '') || (additionalInfo.hobbies && additionalInfo.hobbies !== '') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.awardsAndActivities) {
                    htmlStr += `
                                <div class="section">
                                    <div class="section-title">Additional Info</div>
                                    <div class="text">
                    `;
                    let addInfoText = [];
                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.certifications && additionalInfo.certifications !== '') {
                        addInfoText.push(`<strong>Certifications:</strong> ${inlineHTML(additionalInfo.certifications)}`);
                    }

                    if (additionalInfo.hobbies && additionalInfo.hobbies !== '') {
                        addInfoText.push(`<strong>Hobbies:</strong> ${inlineHTML(additionalInfo.hobbies)}`);
                    }
                    
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities !== '') {
                        addInfoText.push(`<strong>Awards:</strong> ${inlineHTML(additionalInfo.awardsAndActivities)}`);
                    }

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`DOB: ${escapeHTML(additionalInfo.dob)}`);
                        addInfoText.push(`<strong>Details:</strong> ${pdText.join(' | ')}`);
                    }

                    htmlStr += addInfoText.join('<br>') + `
                                    </div>
                                </div>
                                <div class="divider"></div>
                    `;
                }

                htmlStr += `
                            </div> <!-- END LEFT -->

                            <!-- RIGHT -->
                            <div class="timeline">
                `;

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                                <div class="section">
                                    <div class="section-title">Work Experience</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            let durationStr = `${exp.startYear}–${exp.current ? 'NOW' : exp.endYear}`;
                            htmlStr += `
                                    <div class="job">
                                        <div class="job-date">${escapeHTML(durationStr)}</div>
                                        <div class="job-title">${escapeHTML(exp.role)}${exp.company ? ` | ${escapeHTML(exp.company)}` : ''}</div>
                                        ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                    </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                                <div class="divider"></div>
                                <div class="section">
                                    <div class="section-title">Internship Experience</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            let durationStr = `${exp.startYear}–${exp.current ? 'NOW' : exp.endYear}`;
                            htmlStr += `
                                    <div class="job">
                                        <div class="job-date">${escapeHTML(durationStr)}</div>
                                        <div class="job-title">${escapeHTML(exp.role)}${exp.company ? ` | ${escapeHTML(exp.company)}` : ''}</div>
                                        ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                    </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                                <div class="divider"></div>
                                <div class="bottom">
                                    <div class="section">
                                        <div class="section-title">Projects</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                                        <div class="project">
                                            <strong>${escapeHTML(p.name)}</strong>
                                            ${p.desc ? p.desc : (p.link ? `<a href="${escapeHTML(p.link)}" style="color:inherit;">${escapeHTML(p.link)}</a>` : '')}
                                        </div>
                        `;
                    }
                    htmlStr += `
                                    </div>
                                </div>
                    `;
                }

                htmlStr += `
                            </div> <!-- END RIGHT -->
                        </div> <!-- END MAIN -->
                    </div> <!-- END CONTENT -->
                    <div class="bottom-strip"></div>
                `;
            } else if (data.template === '14') {
                const nameStr = data.fullName || "Your Name";
                const titleStr = data.title || "";
                
                htmlStr += `
                    <!-- HEADER -->
                    <div class="header">
                        <div>
                            <div class="name">${escapeHTML(nameStr).toUpperCase()}</div>
                            ${titleStr ? `<div class="role">${escapeHTML(titleStr)}</div>` : ''}
                        </div>
                        <div class="header-bar"></div>
                    </div>

                    <!-- CONTACT -->
                    <div class="contact">
                `;
                
                const getContactIcon = (type) => {
                    const color = "#8b1e3f";
                    const size = "14";
                    switch(type) {
                        case 'phone': return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
                        case 'location': return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
                        case 'website': return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
                        case 'email': return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
                        case 'linkedin': return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`;
                        default: return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`; 
                    }
                };
                let contactItems = [];
                const pushContact = (type, val) => {
                    if (val) contactItems.push(`<div style="display:flex; align-items:center; gap:6px;">${getContactIcon(type)} <span>${escapeHTML(val)}</span></div>`);
                };
                pushContact('phone', data.phone);
                pushContact('location', [data.city, data.country].filter(Boolean).join(', '));
                pushContact('website', additionalInfo.website);
                pushContact('email', data.email);
                pushContact('linkedin', additionalInfo.linkedin);
                
                htmlStr += contactItems.join('') + `
                    </div>
                `;

                htmlStr += `
                    <div class="content">
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <!-- ABOUT -->
                        <div class="section">
                            <div class="section-title">ABOUT ME</div>
                            <div class="section-line"></div>
                            <div class="text">${summaryText}</div>
                        </div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <!-- EXPERIENCE -->
                            <div class="section">
                                <div class="section-title">WORK EXPERIENCE</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            let durationStr = `${exp.startYear}–${exp.current ? 'NOW' : exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.company ? `${exp.company} – ` : '')}${escapeHTML(exp.role)}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <!-- INTERNSHIP -->
                            <div class="section">
                                <div class="section-title">INTERNSHIP EXPERIENCE</div>
                                <div class="section-line"></div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            let durationStr = `${exp.startYear}–${exp.current ? 'NOW' : exp.endYear}`;
                            htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(exp.company ? `${exp.company} – ` : '')}${escapeHTML(exp.role)}</div>
                                        <div class="date">${escapeHTML(durationStr)}</div>
                                    </div>
                                    ${exp.description ? `<div class="job-desc">${exp.description}</div>` : ''}
                                </div>
                            `;
                        }
                        htmlStr += `</div>`;
                    }
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                            <!-- PROJECTS -->
                            <div class="section">
                                <div class="section-title">PROJECTS</div>
                                <div class="section-line"></div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                                <div class="job">
                                    <div class="job-header">
                                        <div>${escapeHTML(p.name)}</div>
                                    </div>
                                    <div class="job-desc">${p.desc ? p.desc : (p.link ? `<a href="${escapeHTML(p.link)}" style="color:inherit;">${escapeHTML(p.link)}</a>` : '')}</div>
                                </div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <!-- EDUCATION -->
                        <div class="section">
                            <div class="section-title">EDUCATION</div>
                            <div class="section-line"></div>
                            <div class="edu">
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        let durationStr = `${escapeHTML(edu.gradYear)}`;
                        htmlStr += `
                                <div class="edu-item">
                                    <div>
                                        <div class="edu-title">${escapeHTML(edu.school)}</div>
                                        <div class="edu-sub">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                                        ${edu.coursework && edu.coursework.trim() ? `<div class="job-desc" style="margin-top:2px;"><strong>Coursework:</strong> ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                                    </div>
                                    <div class="date">${durationStr}</div>
                                </div>
                        `;
                    }
                    htmlStr += `
                            </div>
                        </div>
                    `;
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                        <!-- SKILLS -->
                        <div class="section">
                            <div class="section-title">SKILLS</div>
                            <div class="section-line"></div>
                            <div class="skills">
                    `;
                    const col1 = [], col2 = [], col3 = [];
                    for (let i = 0; i < skillsList.length; i++) {
                        if (i % 3 === 0) col1.push(skillsList[i]);
                        else if (i % 3 === 1) col2.push(skillsList[i]);
                        else col3.push(skillsList[i]);
                    }
                    const renderList = (col) => col.length > 0 ? `<ul>${col.map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}</ul>` : '<div></div>';
                    htmlStr += `
                                ${renderList(col1)}
                                ${renderList(col2)}
                                ${renderList(col3)}
                            </div>
                        </div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                        <!-- LANGUAGES -->
                        <div class="section">
                            <div class="section-title">LANGUAGES</div>
                            <div class="section-line"></div>
                            <div class="skills">
                    `;
                    const langList = additionalInfo.languages;
                    const col1 = [], col2 = [], col3 = [];
                    for (let i = 0; i < langList.length; i++) {
                        if (i % 3 === 0) col1.push(langList[i]);
                        else if (i % 3 === 1) col2.push(langList[i]);
                        else col3.push(langList[i]);
                    }
                    const renderList = (col) => col.length > 0 ? `<ul>${col.map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}</ul>` : '<div></div>';
                    htmlStr += `
                                ${renderList(col1)}
                                ${renderList(col2)}
                                ${renderList(col3)}
                            </div>
                        </div>
                    `;
                }

                if ((additionalInfo.certifications && additionalInfo.certifications !== '') || (additionalInfo.hobbies && additionalInfo.hobbies !== '') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.awardsAndActivities) {
                    htmlStr += `
                        <!-- ADDITIONAL INFO -->
                        <div class="section">
                            <div class="section-title">ADDITIONAL INFO</div>
                            <div class="section-line"></div>
                            <div class="text">
                    `;
                    let addInfoText = [];
                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.certifications && additionalInfo.certifications !== '') addInfoText.push(`<strong>Certifications:</strong> ${inlineHTML(additionalInfo.certifications)}`);
                    if (additionalInfo.hobbies && additionalInfo.hobbies !== '') addInfoText.push(`<strong>Hobbies:</strong> ${inlineHTML(additionalInfo.hobbies)}`);
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities !== '') addInfoText.push(`<strong>Awards:</strong> ${inlineHTML(additionalInfo.awardsAndActivities)}`);

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`DOB: ${escapeHTML(additionalInfo.dob)}`);
                        addInfoText.push(`<strong>Details:</strong> ${pdText.join(' | ')}`);
                    }

                    htmlStr += addInfoText.join('<br>') + `
                            </div>
                        </div>
                    `;
                }

                htmlStr += `
                    </div> <!-- END .content -->
                `;
            } else if (data.template === '15') {
                const nameStr = data.fullName || "Your Name";
                const titleStr = data.title || "";
                
                htmlStr += `
                    <!-- HEADER -->
                    <div class="header">
                        <div class="header-left">
                            <h1>${escapeHTML(nameStr)}</h1>
                            ${titleStr ? `<div class="title">${escapeHTML(titleStr)}</div>` : ''}
                        </div>
                        <div class="header-box"></div>
                    </div>
                    <div class="divider"></div>

                    <!-- BODY -->
                    <div class="body">

                        <!-- LEFT COLUMN -->
                        <div class="left-col">
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                            <!-- About Me -->
                            <div class="section-title">About Me</div>
                            <p class="about-text">${summaryText}</p>
                            <div class="col-divider"></div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <!-- Work Experience -->
                            <div class="section-title">Work Experience</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            const durationText = exp.current ? `NOW–${escapeHTML(exp.startYear)}` : `${escapeHTML(exp.endYear)}–${escapeHTML(exp.startYear)}`;
                            htmlStr += `
                            <div class="work-entry">
                                <div class="work-date">${durationText}</div>
                                <div class="work-content">
                                    <div class="work-company">${escapeHTML(exp.company)}</div>
                                    <div class="work-role">${escapeHTML(exp.role)}</div>
                                    ${exp.description ? `<div class="work-desc">${exp.description}</div>` : ''}
                                </div>
                            </div>
                            `;
                        }
                        htmlStr += `<div class="col-divider"></div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <!-- Internship Experience -->
                            <div class="section-title">Internship Experience</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            const durationText = exp.current ? `NOW–${escapeHTML(exp.startYear)}` : `${escapeHTML(exp.endYear)}–${escapeHTML(exp.startYear)}`;
                            htmlStr += `
                            <div class="work-entry">
                                <div class="work-date">${durationText}</div>
                                <div class="work-content">
                                    <div class="work-company">${escapeHTML(exp.company)}</div>
                                    <div class="work-role">${escapeHTML(exp.role)}</div>
                                    ${exp.description ? `<div class="work-desc">${exp.description}</div>` : ''}
                                </div>
                            </div>
                            `;
                        }
                        htmlStr += `<div class="col-divider"></div>`;
                    }
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);
                if (skillsList.length > 0) {
                    htmlStr += `
                            <!-- Skills -->
                            <div class="section-title">Skills</div>
                            <div class="skills-grid">
                    `;
                    for (let i = 0; i < skillsList.length; i++) {
                        htmlStr += `
                                <div class="skill-item">
                                    <span class="skill-bullet">•</span>
                                    <span class="skill-name">${escapeHTML(skillsList[i].trim())}</span>
                                    <div class="skill-bar-wrap"></div>
                                </div>
                        `;
                    }
                    htmlStr += `
                            </div>
                    `;
                }

                htmlStr += `
                        </div> <!-- /LEFT COLUMN -->

                        <!-- RIGHT COLUMN -->
                        <div class="right-col">
                `;

                const getContactIcon15 = (type) => {
                    const color = "#fff";
                    switch(type) {
                        case 'phone': return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>`;
                        case 'location': return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
                        case 'website': return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
                        case 'email': return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
                        case 'linkedin': return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`;
                        default: return `<svg width="8" height="8" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`; 
                    }
                };

                htmlStr += `
                        <!-- Contact -->
                        <div class="right-section">
                            <div class="section-title">Contact</div>
                            <ul class="contact-list">
                `;
                if (data.phone) htmlStr += `<li><div class="contact-icon">${getContactIcon15('phone')}</div>${escapeHTML(data.phone)}</li>`;
                if (data.city || data.country) htmlStr += `<li><div class="contact-icon">${getContactIcon15('location')}</div>${escapeHTML([data.city, data.country].filter(Boolean).join(', '))}</li>`;
                if (additionalInfo.website) htmlStr += `<li><div class="contact-icon">${getContactIcon15('website')}</div>${escapeHTML(additionalInfo.website)}</li>`;
                if (data.email) htmlStr += `<li><div class="contact-icon">${getContactIcon15('email')}</div>${escapeHTML(data.email)}</li>`;
                if (additionalInfo.linkedin) htmlStr += `<li><div class="contact-icon">${getContactIcon15('linkedin')}</div>${escapeHTML(additionalInfo.linkedin)}</li>`;
                
                htmlStr += `
                            </ul>
                        </div>
                        <div class="right-divider"></div>
                `;

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <!-- Education -->
                        <div class="right-section">
                            <div class="section-title">Education</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        let durationStr = `${escapeHTML(edu.startYear)} – ${escapeHTML(edu.gradYear)}`;
                        htmlStr += `
                        <div class="edu-entry">
                            <div class="edu-university">${escapeHTML(edu.school)}</div>
                            <div class="edu-degree">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}${edu.location ? `, ${escapeHTML(edu.location)}` : ''}</div>
                            <div class="edu-year">${durationStr}</div>
                            ${edu.coursework && edu.coursework.trim() ? `<div class="edu-year" style="margin-top:2px;">Coursework: ${escapeHTML(edu.coursework).replace(/\\n/g, '<br>')}</div>` : ''}
                        </div>
                        `;
                    }
                    htmlStr += `
                        </div>
                        <div class="right-divider"></div>
                    `;
                }

                const projects = resumeData.projects || [];
                if (projects.length > 0) {
                    htmlStr += `
                        <!-- Projects -->
                        <div class="right-section">
                            <div class="section-title">Projects</div>
                    `;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                        <div class="proj-entry">
                            <div class="proj-name">${escapeHTML(p.name)}</div>
                            <div class="proj-sub">${p.desc ? p.desc : (p.link ? `<a href="${escapeHTML(p.link)}" style="color:inherit;text-decoration:none;">${escapeHTML(p.link)}</a>` : '')}</div>
                        </div>
                        `;
                    }
                    htmlStr += `
                        </div>
                        <div class="right-divider"></div>
                    `;
                }

                if (additionalInfo.certifications && additionalInfo.certifications !== '') {
                    htmlStr += `
                        <!-- Certifications -->
                        <div class="right-section">
                            <div class="section-title">Certifications</div>
                            <div class="proj-entry">
                                <div class="proj-sub">${additionalInfo.certifications}</div>
                            </div>
                        </div>
                        <div class="right-divider"></div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
                        <!-- Languages -->
                        <div class="right-section">
                            <div class="section-title">Languages</div>
                            <ul class="lang-list">
                    `;
                    for (let i = 0; i < additionalInfo.languages.length; i++) {
                        htmlStr += `<li><span class="lang-bullet">•</span> ${escapeHTML(additionalInfo.languages[i].trim())}</li>`;
                    }
                    htmlStr += `
                            </ul>
                        </div>
                    `;
                }

                if ((additionalInfo.hobbies && additionalInfo.hobbies !== '') || additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus || additionalInfo.awardsAndActivities) {
                    htmlStr += `
                        <div class="right-divider" style="margin-top:-5px;"></div>
                        <!-- Additional Info -->
                        <div class="right-section">
                            <div class="section-title">Additional Details</div>
                            <div class="proj-entry">
                    `;
                    let addInfoText = [];
                    const inlineHTML = (html) => {
                        if (!html) return '';
                        return html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/,\s*,/g, ', ').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
                    };

                    if (additionalInfo.hobbies && additionalInfo.hobbies !== '') addInfoText.push(`<strong>Hobbies:</strong> ${inlineHTML(additionalInfo.hobbies)}`);
                    if (additionalInfo.awardsAndActivities && additionalInfo.awardsAndActivities !== '') addInfoText.push(`<strong>Awards:</strong> ${inlineHTML(additionalInfo.awardsAndActivities)}`);

                    if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                        let pdText = [];
                        if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                        if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                        if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                        if (additionalInfo.dob) pdText.push(`DOB: ${escapeHTML(additionalInfo.dob)}`);
                        addInfoText.push(`<strong>Details:</strong> ${pdText.join(' | ')}`);
                    }

                    htmlStr += `<div class="proj-sub">` + addInfoText.join('<br>') + `</div>
                            </div>
                        </div>
                    `;
                }

                htmlStr += `
                        </div> <!-- /RIGHT COLUMN -->

                    </div> <!-- /BODY -->
                `;
            } else if (data.template === 'professional') {
                htmlStr += `
                    <div class="prof-accent"></div>
                    <div class="prof-header">
                        <div class="prof-name">${escapeHTML(data.fullName)}</div>
                    </div>
                    <div class="prof-body">
                        <div class="prof-left">
                            <div class="prof-section">
                                <div class="prof-section-title">Professional Summary</div>
                                <div class="prof-text">${escapeHTML(resumeData.summary || data.summary)}</div>
                            </div>
                            
                `;
                
                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];
                
                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <div class="prof-section">
                                <div class="prof-section-title">Work Experience</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
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
                        htmlStr += `</div>`;
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <div class="prof-section">
                                <div class="prof-section-title">Internship Experience</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
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
                        htmlStr += `</div>`;
                    }
                }
                
                htmlStr += `
                            <div class="prof-section">
                                <div class="prof-section-title">Education</div>
                `;
                for (let i = 0; i < education.length; i++) {
                    const edu = education[i];
                    if (!edu.school.trim()) continue;
                    htmlStr += `
                        <div class="prof-item">
                            <div class="prof-item-title">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
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

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);

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
                                    ${skillsList.map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}
                                </ul>
                            </div>
                            
                            ${additionalInfo.languages && additionalInfo.languages.length > 0 ? `
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
            } else if (data.template === '16') {
                const nameStr = data.fullName || "Your Name";
                const titleStr = data.title || "";
                
                htmlStr += `
                    <div class="resume">
                        <!-- HEADER -->
                        <div class="header">
                            <div class="name">${escapeHTML(nameStr)}</div>
                            <div class="role">${escapeHTML(titleStr)}</div>

                            <div class="contact">
                `;

                const getContactIcon16 = (type) => {
                    const color = "#123a6b";
                    switch(type) {
                        case 'phone': return `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: ${color};"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>`;
                        case 'location': return `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: ${color};"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
                        case 'website': return `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: ${color};"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
                        case 'email': return `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: ${color};"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
                        case 'linkedin': return `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: ${color};"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`;
                        default: return "";
                    }
                };

                let contactItems = [];
                if (data.phone) {
                    contactItems.push(`
                        <div class="contact-item">
                            ${getContactIcon16('phone')}
                            ${escapeHTML(data.phone)}
                        </div>
                    `);
                }
                if (data.city || data.country) {
                    contactItems.push(`
                        <div class="contact-item">
                            ${getContactIcon16('location')}
                            ${escapeHTML([data.city, data.country].filter(Boolean).join(', '))}
                        </div>
                    `);
                }
                if (additionalInfo.website) {
                    contactItems.push(`
                        <div class="contact-item">
                            ${getContactIcon16('website')}
                            ${escapeHTML(additionalInfo.website)}
                        </div>
                    `);
                }
                if (additionalInfo.linkedin) {
                    contactItems.push(`
                        <div class="contact-item">
                            ${getContactIcon16('linkedin')}
                            ${escapeHTML(additionalInfo.linkedin)}
                        </div>
                    `);
                }
                if (data.email) {
                    contactItems.push(`
                        <div class="contact-item">
                            ${getContactIcon16('email')}
                            ${escapeHTML(data.email)}
                        </div>
                    `);
                }

                htmlStr += contactItems.join('');

                htmlStr += `
                            </div>
                        </div>
                `;

                const summaryText = resumeData.summary || data.summary || "";
                if (summaryText.trim() && summaryText !== '<br>') {
                    htmlStr += `
                        <!-- ABOUT -->
                        <div class="section-bar">ABOUT ME</div>
                        <div class="text">${summaryText}</div>
                    `;
                }

                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];

                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <!-- EXPERIENCE -->
                            <div class="section-bar">WORK EXPERIENCE</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
                            const durationText = exp.current ? `NOW-${escapeHTML(exp.startYear)}` : `${escapeHTML(exp.endYear)}-${escapeHTML(exp.startYear)}`;
                            htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div>${escapeHTML(exp.company)} – ${escapeHTML(exp.role)}</div>
                                    <div>${durationText}</div>
                                </div>
                                ${exp.description ? `<div class="text" style="margin-top: 5px;">${exp.description}</div>` : ''}
                            </div>
                            `;
                        }
                    }
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <!-- INTERNSHIP EXPERIENCE -->
                            <div class="section-bar">INTERNSHIP EXPERIENCE</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
                            const durationText = exp.current ? `NOW-${escapeHTML(exp.startYear)}` : `${escapeHTML(exp.endYear)}-${escapeHTML(exp.startYear)}`;
                            htmlStr += `
                            <div class="job">
                                <div class="job-header">
                                    <div>${escapeHTML(exp.company)} – ${escapeHTML(exp.role)}</div>
                                    <div>${durationText}</div>
                                </div>
                                ${exp.description ? `<div class="text" style="margin-top: 5px;">${exp.description}</div>` : ''}
                            </div>
                            `;
                        }
                    }
                }

                const education = resumeData.education || [];
                if (education.length > 0) {
                    htmlStr += `
                        <!-- EDUCATION -->
                        <div class="section-bar">EDUCATION</div>
                    `;
                    for (let i = 0; i < education.length; i++) {
                        const edu = education[i];
                        if (!edu.school.trim()) continue;
                        const durationStr = `${escapeHTML(edu.startYear || '')}–${escapeHTML(edu.gradYear || '')}`;
                        htmlStr += `
                        <div class="edu-item">
                            <div>
                                <div class="edu-title">${escapeHTML(edu.school)}</div>
                                <div class="text">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
                            </div>
                            <div>${durationStr}</div>
                        </div>
                        `;
                    }
                }

                const skillsList = resumeData.skills || (data.skills ? data.skills.split(',') : []);

                if (skillsList.length > 0) {
                    htmlStr += `
                        <!-- SKILLS -->
                        <div class="section-bar">SKILLS</div>
                        <div class="skills">
                    `;
                    
                    const colLength = Math.ceil(skillsList.length / 3);
                    
                    for (let c = 0; c < 3; c++) {
                        htmlStr += `<ul style="margin: 0; padding-left: 18px;">`;
                        for (let r = 0; r < colLength; r++) {
                            const index = c * colLength + r;
                            if (index < skillsList.length) {
                                htmlStr += `<li class="text" style="margin-bottom: 4px;">${escapeHTML(skillsList[index].trim())}</li>`;
                            }
                        }
                        htmlStr += `</ul>`;
                    }
                    htmlStr += `</div>`;
                }

                htmlStr += `
                    <!-- BOTTOM -->
                    <div class="bottom">
                `;

                const projects = resumeData.projects || [];
                let hasLeftBottomContent = false;
                if (projects.length > 0) {
                    htmlStr += `<div>`;
                    hasLeftBottomContent = true;
                    htmlStr += `<div class="section-bar">PROJECTS</div>`;
                    for (let i = 0; i < projects.length; i++) {
                        const p = projects[i];
                        htmlStr += `
                            <div class="edu-title">${escapeHTML(p.name)}</div>
                            ${p.link ? `<div class="text"><a href="${escapeHTML(p.link)}" style="color:inherit;text-decoration:none;">${escapeHTML(p.link)}</a></div>` : ''}
                            <div class="text" style="margin-bottom:10px;">${p.desc}</div>
                        `;
                    }
                    htmlStr += `</div>`;
                }

                if (!hasLeftBottomContent) {
                    htmlStr += `<div></div>`; // Empty placeholder for grid
                }

                // Right Bottom Grid
                let rightBottomHtml = ``;
                
                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    rightBottomHtml += `
                        <div class="section-bar">CERTIFICATIONS</div>
                        <div class="text" style="margin-bottom:10px;">${additionalInfo.certifications}</div>
                    `;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    rightBottomHtml += `
                        <div class="section-bar">HOBBIES</div>
                        <div class="text" style="margin-bottom:10px;">${additionalInfo.hobbies}</div>
                    `;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    rightBottomHtml += `
                        <div class="section-bar">LANGUAGES</div>
                        <ul style="margin: 0; padding-left: 18px; margin-bottom: 10px;">
                    `;
                    for (let l of additionalInfo.languages) {
                        rightBottomHtml += `<li class="text" style="margin-bottom: 4px;">${escapeHTML(l.trim())}</li>`;
                    }
                    rightBottomHtml += `</ul>`;
                }

                let pdText = [];
                if (additionalInfo.nationality) pdText.push(`Nationality: ${escapeHTML(additionalInfo.nationality)}`);
                if (additionalInfo.maritalStatus) pdText.push(`Marital Status: ${escapeHTML(additionalInfo.maritalStatus)}`);
                if (additionalInfo.visaStatus) pdText.push(`Visa Status: ${escapeHTML(additionalInfo.visaStatus)}`);
                if (additionalInfo.dob) pdText.push(`DOB: ${escapeHTML(additionalInfo.dob)}`);
                
                if (pdText.length > 0) {
                    rightBottomHtml += `
                        <div class="section-bar">PERSONAL DETAILS</div>
                        <div class="text">${pdText.join('<br>')}</div>
                    `;
                }

                if (rightBottomHtml) {
                    htmlStr += `<div>${rightBottomHtml}</div>`;
                } else {
                    htmlStr += `<div></div>`;
                }

                htmlStr += `
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
                        <div class="cv-summary">${escapeHTML(resumeData.summary || data.summary)}</div>
                    </div>
                    
                    <div class="cv-section">
                        <div class="cv-section-title">Skills</div>
                        <div class="cv-skills">
                            ${(resumeData.skills || (data.skills ? data.skills.split(',') : [])).map(s => `<span class="cv-skill-tag">${escapeHTML(s.trim())}</span>`).join('')}
                        </div>
                    </div>
                `;
                
                const workExpArray = resumeData.workExperience || resumeData.work || [];
                const internExpArray = resumeData.internshipExperience || [];
                
                if (resumeData.experienceType !== 'fresher') {
                    if (workExpArray.length > 0) {
                        htmlStr += `
                            <div class="cv-section">
                                <div class="cv-section-title">Work Experience</div>
                        `;
                        for (let i = 0; i < workExpArray.length; i++) {
                            const exp = workExpArray[i];
                            if (!exp.company.trim()) continue;
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
                    }
                    
                    if (internExpArray.length > 0) {
                        htmlStr += `
                            <div class="cv-section">
                                <div class="cv-section-title">Internship Experience</div>
                        `;
                        for (let i = 0; i < internExpArray.length; i++) {
                            const exp = internExpArray[i];
                            if (!exp.company.trim()) continue;
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
                    }
                }

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
                                <div class="cv-item-title">${window.formatEducationTitle(edu.degree, edu.fieldOfStudy)}</div>
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

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
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

            } else if (data.template === '17') {
                htmlStr += `<div class="resume">
    <div class="header">
        <div class="name">${escapeHTML(contact.fullName || '')}</div>
    </div>
    <div class="content">
        <div class="top-info">
            ${contact.phone || contact.email || contact.address || contact.linkedIn ? `<div><span>Contact</span></div>` : ''}
            ${contact.address ? `<div><span>Address</span> ${escapeHTML(contact.address)}</div>` : ''}
            ${contact.phone ? `<div><span>Phone</span> ${escapeHTML(contact.phone)}</div>` : ''}
            ${contact.email ? `<div><span>Email</span> ${escapeHTML(contact.email)}</div>` : ''}
            ${contact.linkedIn ? `<div><span>LinkedIn</span> ${escapeHTML(contact.linkedIn)}</div>` : ''}
        </div>`;

                if (contact.summary && contact.summary.trim() !== '' && contact.summary !== '<br>') {
                    htmlStr += `
        <div class="text">${contact.summary}</div>`;
                }

                if (skills && skills.length > 0) {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Skills</div>
            <div class="skills">
                ${skills.map(s => `<div class="skill">${escapeHTML(s)}</div>`).join('')}
            </div>
        </div>`;
                }

                if (workExperience && workExperience.length > 0) {
                    const hasWork = data.experienceType === 'work' || data.experienceType === 'both';
                    const hasIntern = data.experienceType === 'internship' || data.experienceType === 'both';
                    
                    if (data.experienceType !== 'fresher') {
                        let expHtml = '';
                        workExperience.forEach(exp => {
                            if (exp.type === 'work' && !hasWork) return;
                            if (exp.type === 'internship' && !hasIntern) return;
                            
                            let jobTitle = exp.jobTitle || '';
                            if (exp.type === 'internship') jobTitle += " (Internship)";
                            
                            expHtml += `
            <div class="job">
                <div class="job-left">${escapeHTML(exp.startDate || '')} - ${exp.isCurrent ? 'Current' : escapeHTML(exp.endDate || '')}</div>
                <div class="job-right">
                    <div class="job-title">${escapeHTML(jobTitle)}</div>
                    ${exp.company ? `<div class="job-company">${escapeHTML(exp.company)}${exp.location ? ', ' + escapeHTML(exp.location) : ''}</div>` : ''}
                    ${exp.description ? `<div class="text">${exp.description}</div>` : ''}
                </div>
            </div>`;
                        });
                        
                        if (expHtml) {
                            htmlStr += `
        <div class="section">
            <div class="section-title">Work History</div>
            ${expHtml}
        </div>`;
                        }
                    }
                }

                if (education && education.length > 0) {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Education</div>`;
                    education.forEach(edu => {
                        const eduTitleRaw = formatEducationTitle(edu.degree, edu.fieldOfStudy);
                        const eduTitleOutput = eduTitleRaw ? `<strong>${eduTitleRaw}</strong><br>` : '';
                        const instLocStr = [edu.institution, edu.location].filter(Boolean).map(escapeHTML).join(', ');
                        const scoreStr = edu.score ? escapeHTML(edu.score) : '';
                        
                        htmlStr += `
            <div class="edu">
                <div class="edu-left">${escapeHTML(edu.graduationDate || '')}</div>
                <div class="edu-right">
                    ${eduTitleOutput}
                    ${instLocStr}${instLocStr && scoreStr ? ' - ' : ''}${scoreStr}
                </div>
            </div>`;
                    });
                    htmlStr += `
        </div>`;
                }
                
                if (projects && projects.length > 0) {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Projects</div>`;
                    projects.forEach(p => {
                        htmlStr += `
            <div class="job">
                <div class="job-left">${p.link ? `<a href="${escapeHTML(p.link)}" style="color:#666; text-decoration:none;">Link</a>` : ''}</div>
                <div class="job-right">
                    <div class="job-title">${escapeHTML(p.name)}</div>
                    ${p.desc ? `<div class="text">${p.desc}</div>` : ''}
                </div>
            </div>`;
                    });
                    htmlStr += `
        </div>`;
                }

                if (additionalInfo.certifications && additionalInfo.certifications.trim() !== '' && additionalInfo.certifications !== '<br>') {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Certifications</div>
            <div class="text">${additionalInfo.certifications}</div>
        </div>`;
                }

                if (additionalInfo.languages && additionalInfo.languages.length > 0) {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Languages</div>
            <div class="skills">
                ${additionalInfo.languages.map(l => `<div class="skill">${escapeHTML(l)}</div>`).join('')}
            </div>
        </div>`;
                }

                if (additionalInfo.hobbies && additionalInfo.hobbies.trim() !== '' && additionalInfo.hobbies !== '<br>') {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Hobbies</div>
            <div class="text">${additionalInfo.hobbies}</div>
        </div>`;
                }

                if (additionalInfo.dob || additionalInfo.nationality || additionalInfo.maritalStatus || additionalInfo.visaStatus) {
                    htmlStr += `
        <div class="section">
            <div class="section-title">Personal Details</div>
            <div class="text" style="display:flex; flex-wrap:wrap; gap:15px;">
                ${additionalInfo.nationality ? `<div><strong>Nationality:</strong> ${escapeHTML(additionalInfo.nationality)}</div>` : ''}
                ${additionalInfo.maritalStatus ? `<div><strong>Marital Status:</strong> ${escapeHTML(additionalInfo.maritalStatus)}</div>` : ''}
                ${additionalInfo.visaStatus ? `<div><strong>Visa Status:</strong> ${escapeHTML(additionalInfo.visaStatus)}</div>` : ''}
                ${additionalInfo.dob ? `<div><strong>Date of Birth:</strong> ${escapeHTML(additionalInfo.dob)}</div>` : ''}
            </div>
        </div>`;
                }

                htmlStr += `
    </div>
</div>`;
            }
            return htmlStr;
        };

        // 3. Build HTML Template string
        const htmlStr = window.generateResumeHTML(currentResumeData);

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
            // Desktop fallback & scaling
            let desktopScale = 1;
            if (window.innerWidth >= 1400) {
                desktopScale = 1.15;
            } else if (window.innerWidth >= 1100) {
                desktopScale = 1.05;
            }

            if (desktopScale > 1) {
                docElement.style.transform = 'none'; // reset to calculate true height
                const originalHeight = docElement.scrollHeight || 1056;
                docElement.style.transform = `scale(${desktopScale})`;
                docElement.style.transformOrigin = 'top center';
                wrapper.style.height = `${(originalHeight * desktopScale) + 64}px`;
                wrapper.style.padding = '32px 0';
                wrapper.style.overflow = 'hidden';
            } else {
                docElement.style.transform = 'none';
                wrapper.style.height = 'auto';
                wrapper.style.overflow = 'auto';
                wrapper.style.padding = '0';
            }
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

    // Utility: Toast Notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.innerText = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.backgroundColor = '#10b981';
        toast.style.color = '#fff';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        toast.style.zIndex = '9999';
        toast.style.fontWeight = '500';
        toast.style.transition = 'opacity 0.3s ease';
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

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
                        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
                        lastPaymentAmount: "19",
                        lastPaymentDate: Date.now()
                    } : {
                        singleDownload: true,
                        lastPaymentAmount: "2",
                        lastPaymentDate: Date.now()
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

    let isSignUpMode = false;
    let currentUser = null;
    let isAuthLoaded = false;
    let pendingSave = false;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        isAuthLoaded = true;

        if (user && pendingSave) {
            pendingSave = false;
            if (authModal) authModal.classList.remove('active');
            executeSaveAction();
        }
    });


    if (closeAuthBtn && authModal) {
        closeAuthBtn.addEventListener('click', () => {
            authModal.classList.remove('active');
            if (authErrorMsg) authErrorMsg.style.display = 'none';
            if (authForm) authForm.reset();
        });
    }

    window.setAuthMode = function(mode) {
        if (!authModal) return;
        isSignUpMode = (mode === 'signup');
        if (isSignUpMode) {
            authTitle.innerText = 'Create Account';
            authSubtitle.innerText = 'Sign up to start saving resumes';
            authToggleText.innerText = 'Already have an account?';
            authToggleBtn.innerText = 'Login';
            authSubmitBtn.innerText = 'Sign Up';
        } else {
            authTitle.innerText = 'Welcome Back';
            authSubtitle.innerText = 'Login to save your resume';
            authToggleText.innerText = 'Don\'t have an account?';
            authToggleBtn.innerText = 'Sign Up';
            authSubmitBtn.innerText = 'Login';
        }
        if (authErrorMsg) authErrorMsg.style.display = 'none';
        authModal.classList.add('active');
    };

    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.setAuthMode(isSignUpMode ? 'login' : 'signup');
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
                
                // Immediately close the modal and show success feedback
                if (authModal) authModal.classList.remove('active');
                showToast(isSignUpMode ? "Account created successfully!" : "Logged in successfully!");


                if (pendingPaymentPrompt) {
                    pendingPaymentPrompt = false;
                    setTimeout(() => {
                        if (typeof window.openPaymentModal === 'function') {
                            window.openPaymentModal();
                        }
                    }, 500); // short delay to allow auth state UI updates
                }
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    authErrorMsg.innerHTML = `
                        <div style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 12px; border-radius: 6px; color: #d97706; font-size: 0.9rem; text-align: left;">
                            <div style="font-weight: 600; margin-bottom: 4px;"><i class="fas fa-exclamation-circle"></i> Account already exists with this email</div>
                            <div style="margin-bottom: 8px;">Please login instead.</div>
                            <button type="button" id="btn-switch-to-login" style="background: none; border: none; color: var(--accent-color); font-weight: 600; cursor: pointer; padding: 0;">[ Go to Login ]</button>
                        </div>
                    `;
                    authErrorMsg.style.display = 'block';

                    const btnSwitch = document.getElementById('btn-switch-to-login');
                    if (btnSwitch) {
                        btnSwitch.addEventListener('click', (e) => {
                            e.preventDefault();
                            const toggleBtn = document.getElementById('auth-toggle-btn');
                            if (toggleBtn) toggleBtn.click();
                        });
                    }
                } else if (error.code === 'auth/invalid-credential') {
                    authErrorMsg.innerText = 'Invalid email or password. Please try again.';
                    authErrorMsg.style.color = '#ef4444';
                    authErrorMsg.style.fontSize = '0.875rem';
                    authErrorMsg.style.marginTop = '0.5rem';
                    authErrorMsg.style.display = 'block';
                } else {
                    // Fallback for other errors formatting as text to prevent XSS
                    authErrorMsg.innerText = error.message;
                    authErrorMsg.style.color = '#ef4444';
                    authErrorMsg.style.fontSize = '0.875rem';
                    authErrorMsg.style.marginTop = '0.5rem';
                    authErrorMsg.style.display = 'block';
                }
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.innerText = isSignUpMode ? 'Sign Up' : 'Login';
            }
        });
    }

    const executeSaveAction = async () => {
        if (!currentResumeData) {
            alert("Please generate a resume first before saving.");
            return;
        }

        try {
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btnSave.disabled = true;

            // In the previous codebase this saved to a subcollection "users/{uid}/resumes"
            // Wait, in my previous edit for dashboard, it was saved to the direct collection "resumes" natively on line 480.
            // Let's stick to the "resumes" collection since fetchMyResumes() queries it.
            const resumeDataToSave = {
                userId: currentUser.uid,
                data: currentResumeData,
                template: currentResumeData.contact.template || selectedTemplate,
                updatedAt: serverTimestamp()
            };

            await addDoc(collection(db, "resumes"), resumeDataToSave);

            alert("Resume saved successfully!");
            // Optionally show "View My Resumes"
            // Let's redirect to dashboard and fetch resumes to show it
            navigateTo('dashboard');
            fetchMyResumes();

        } catch (error) {
            console.error("Error saving resume: ", error);
            alert("Failed to save resume: " + error.message);
        } finally {
            btnSave.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save to Account';
            btnSave.disabled = false;
        }
    };

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            if (!isAuthLoaded) {
                alert('Still loading authentication state, please wait...');
                return;
            }
            if (!currentUser) {
                pendingSave = true;
                if (authModal) {
                    authTitle.innerText = 'Sign In to Save';
                    authSubtitle.innerText = 'Please log in to save your resume';
                    authModal.classList.add('active');
                } else {
                    alert("Please log in to save your resume.");
                }
                return;
            }

            executeSaveAction();
        });
    }

    // --- CONTACT US FORM (EMAILJS) ---
    const contactForm = document.getElementById('contact-us-form');
    const contactName = document.getElementById('contact-name');
    const contactEmail = document.getElementById('contact-email');
    const contactMessage = document.getElementById('contact-message');
    const btnSendContact = document.getElementById('btn-send-contact');

    if (contactForm && btnSendContact) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!contactName.value || !contactEmail.value || !contactMessage.value) {
                alert("Please fill out all fields.");
                return;
            }

            const originalBtnHtml = btnSendContact.innerHTML;
            btnSendContact.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            btnSendContact.disabled = true;

            try {
                // IMPORTANT: Replace these with your actual EmailJS configuration keys
                // 1. Service ID
                // 2. Template ID
                // 3. Public Key

                const serviceID = "service_7bticj1";
                const templateID = "template_eq5mkfp";
                const publicKey = "wdHW2ZSt5RfVaW1AR";

                // We can initialize it just-in-time or pass public key inline
                emailjs.init(publicKey);

                const templateParams = {
                    from_name: contactName.value,
                    reply_to: contactEmail.value,
                    message: contactMessage.value,
                    to_email: 'techyforeverofficial1@gmail.com'
                };

                await emailjs.send(serviceID, templateID, templateParams);

                alert("Message sent successfully!");
                contactForm.reset();
            } catch (err) {
                console.error("EmailJS Error: ", err);
                alert("Failed to send message, please try again");
            } finally {
                btnSendContact.innerHTML = originalBtnHtml;
                btnSendContact.disabled = false;
            }
        });
    }

    // --- SUBSCRIPTION DATA LOGIC ---
    window.fetchMySubscription = async function() {
        const subContainer = document.getElementById('sub-details-container');
        if (!subContainer) return;
        const user = auth.currentUser;
        
        if (!user) {
            subContainer.innerHTML = '<p style="color: var(--text-secondary);">Please log in to view subscription details.</p>';
            return;
        }

        try {
            subContainer.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading subscription details...</p>';
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                
                let lastPaymentAmt = data.lastPaymentAmount ? `₹${data.lastPaymentAmount}` : 'Not available';
                let lastPaymentDate = data.lastPaymentDate ? new Date(data.lastPaymentDate).toLocaleDateString() : 'Not available';
                
                let isMonthly = !!data.premium;
                let planDisplay = 'Free Plan';
                let priceDisplay = '₹0/month';
                
                let statusBadge = '<span class="sub-badge sub-inactive">Inactive</span>';
                let expiryDateStr = 'Not available';
                let daysRemainingStr = 'Not available';
                let progressPercentage = 0;
                let progressText = '';

                let expiresAt = data.expiresAt || 0;
                let isExpired = Date.now() > expiresAt;

                if (isMonthly) {
                    planDisplay = 'Monthly Plan';
                    priceDisplay = '₹19/month';
                    if (isExpired) {
                        statusBadge = '<span class="sub-badge sub-expired">Expired</span>';
                        expiryDateStr = new Date(expiresAt).toLocaleDateString();
                        daysRemainingStr = '0 days remaining';
                        progressPercentage = 0;
                        progressText = 'Expired';
                    } else {
                        statusBadge = '<span class="sub-badge sub-active">Active</span>';
                        expiryDateStr = new Date(expiresAt).toLocaleDateString();
                        let diffTime = Math.abs(expiresAt - Date.now());
                        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        daysRemainingStr = `${diffDays} days remaining`;
                        // Assume 30 days total for progress
                        progressPercentage = Math.min((diffDays / 30) * 100, 100);
                        progressText = `${diffDays} days remaining out of 30`;
                    }
                } else if (data.singleDownload) {
                    planDisplay = 'Single Download';
                    priceDisplay = '₹2/download';
                    statusBadge = '<span class="sub-badge sub-active">Available</span>';
                }

                subContainer.innerHTML = `
                    <div class="sub-dashboard">
                        <!-- Main Plan Card -->
                        <div class="sub-card plan-card">
                            <div class="plan-header">
                                <div class="plan-info">
                                    <h4 class="plan-title">${planDisplay}</h4>
                                    <div class="plan-price">${priceDisplay}</div>
                                </div>
                                <div class="plan-status">
                                    ${statusBadge}
                                </div>
                            </div>
                            
                            ${isMonthly ? `
                            <div class="plan-progress-container">
                                <div class="progress-label"><span>${progressText}</span></div>
                                <div class="progress-bar-bg">
                                    <div class="progress-bar-fill" style="width: ${progressPercentage}%;"></div>
                                </div>
                            </div>` : ''}
                        </div>

                        <!-- Details Grid Card -->
                        <div class="sub-card details-card">
                            <h4 class="details-title">Subscription Details</h4>
                            <div class="details-grid">
                                <div class="detail-item">
                                    <div class="detail-icon"><i class="fas fa-calendar-alt"></i></div>
                                    <div class="detail-info">
                                        <div class="detail-label">Expiry Date</div>
                                        <div class="detail-value">${expiryDateStr}</div>
                                    </div>
                                </div>
                                <div class="detail-item">
                                    <div class="detail-icon"><i class="fas fa-clock"></i></div>
                                    <div class="detail-info">
                                        <div class="detail-label">Days Remaining</div>
                                        <div class="detail-value">${daysRemainingStr}</div>
                                    </div>
                                </div>
                                <div class="detail-item">
                                    <div class="detail-icon"><i class="fas fa-rupee-sign"></i></div>
                                    <div class="detail-info">
                                        <div class="detail-label">Last Payment</div>
                                        <div class="detail-value">${lastPaymentAmt}</div>
                                    </div>
                                </div>
                                <div class="detail-item">
                                    <div class="detail-icon"><i class="fas fa-check-circle"></i></div>
                                    <div class="detail-info">
                                        <div class="detail-label">Payment Date</div>
                                        <div class="detail-value">${lastPaymentDate}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                subContainer.innerHTML = '<p style="color: var(--text-secondary);">No active subscription found. Upgrade your plan to unlock premium features.</p>';
            }
        } catch (error) {
            console.error("Error fetching subscription:", error);
            subContainer.innerHTML = '<p style="color: var(--danger-color);">Failed to load subscription details.</p>';
        }
    };

    // --- Show/Hide Password Toggle ---
    const togglePasswordBtn = document.getElementById('toggle-auth-password');
    const authPasswordField = document.getElementById('auth-password');
    
    if (togglePasswordBtn && authPasswordField) {
        togglePasswordBtn.addEventListener('click', () => {
            const currentType = authPasswordField.getAttribute('type');
            if (currentType === 'password') {
                authPasswordField.setAttribute('type', 'text');
                togglePasswordBtn.classList.remove('fa-eye');
                togglePasswordBtn.classList.add('fa-eye-slash');
            } else {
                authPasswordField.setAttribute('type', 'password');
                togglePasswordBtn.classList.remove('fa-eye-slash');
                togglePasswordBtn.classList.add('fa-eye');
            }
        });
    }

    // --- Global SPA Navigation ---
    window.addEventListener('popstate', (e) => {
        if (!e.state) return;
        const { page, step } = e.state;
        
        navigateTo(page, true);
        
        if (page === 'form' && step !== null && step !== undefined) {
            showStepByIndex(step, true);
        }
    });

    // Parse URL on Initial Load
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    const step = params.get("step");
    
    console.log("Initial Load Page:", page);

    if (!page) {
        // Default → HOME
        navigateTo("home", true);
        history.replaceState({ page: "home", step: null }, "", "/");
    } else {
        navigateTo(page, true);

        if (page === "form") {
            const stepIndex = step ? Number(step) : 0;
            showStepByIndex(stepIndex, true);
        }
    }

});




