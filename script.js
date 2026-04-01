import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentResumeData = null;
    let pendingPaymentPrompt = false;
    // --- Navigation ---
    const views = {
        home: document.getElementById('home-view'),
        form: document.getElementById('form-view'),
        preview: document.getElementById('preview-view'),
        about: document.getElementById('about-view'),
        contact: document.getElementById('contact-view')
    };

    const navLinks = {
        home: document.getElementById('link-home'),
        about: document.getElementById('link-about'),
        contact: document.getElementById('link-contact')
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
        {
            id: "template1",
            name: "Template 1 (A4 Layout)",
            preview: "templates/template1.jpg"
        },
        {
            id: "modern",
            name: "Modern (Default)",
            preview: "templates/modern.jpg"
        },
        {
            id: "classic",
            name: "Classic Professional",
            preview: ""
        },
        {
            id: "creative",
            name: "Creative Minimal",
            preview: ""
        },
        {
            id: "professional",
            name: "Professional (2-Column)",
            preview: ""
        }
    ];

    if (templateContainer) {
        templateContainer.innerHTML = templatesList.map(t => {
            const imageHtml = t.preview 
                ? `<img src="${t.preview}" alt="${t.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="template-placeholder" style="display:none;">Preview not available</div>`
                : `<div class="template-placeholder">Preview not available</div>`;

            return `
                <label class="template-option">
                    <input type="radio" name="template" value="${t.id}">
                    <div class="template-card ${t.id}-card">
                        <div class="template-preview">${imageHtml}</div>
                        <span class="template-name">${t.name}</span>
                    </div>
                </label>
            `;
        }).join('');
    }

    const templateRadios = document.querySelectorAll('input[name="template"]');
    templateRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedTemplate = e.target.value;
                if (photoContainer) {
                    photoContainer.style.display = (selectedTemplate === 'template1') ? 'flex' : 'none';
                }
            }
        });
    });

    let profilePhotoDataUrl = 'https://via.placeholder.com/150';
    const photoInput = document.getElementById('profilePhoto');
    if (photoInput) {
        photoInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
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
            if(removeBtn) {
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
                        if(e.target.checked) f.value = ''; // clear value
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

    // --- Form Submission & Resume Generation ---
    const form = document.getElementById('resume-form');
    const resumeDoc = document.getElementById('resume-document');

    document.getElementById('btn-generate').addEventListener('click', (e) => {
        e.preventDefault();
        
        // Basic Form Validation (Native validation is blocked by hidden step elements)
        const requiredInputs = form.querySelectorAll('[required]');
        for (let input of requiredInputs) {
            if (!input.disabled && !input.value.trim()) {
                alert(`Please fill out all required fields before generating. Blank field found: ${input.previousElementSibling ? input.previousElementSibling.innerText : input.name}`);
                return; // Stop generation
            }
        }

        if (selectedTemplate === 'template1') {
            if (profilePhotoDataUrl === 'https://via.placeholder.com/150') {
                alert("Please upload a profile photo for the selected template.");
                return;
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
        
        const projNames = formData.getAll('projName[]');
        const projTechs = formData.getAll('projTech[]');
        const projDescs = formData.getAll('projDesc[]');

        currentResumeData = {
            contact: data,
            work: experiences,
            education: education,
            projects: projNames.map((name, i) => ({ name, tech: projTechs[i], desc: projDescs[i] })).filter(p => !!p.name),
            skills: data.skills.split(',').map(s => s.trim()).filter(s => !!s),
            summary: data.summary
        };

        // 3. Build HTML Template string
        let htmlStr = '';

        if (data.template === 'template1') {
            htmlStr += `
                <div class="left">
                    <div class="profile">
                        <img src="${data.profilePhoto}" alt="Profile">
                    </div>

                    <div class="contact">
                        <div class="section-title">CONTACT</div>
                        <p>${escapeHTML(data.email)}</p>
                        <p>${escapeHTML(data.phone)}</p>
                        <p>${escapeHTML(data.city)}${data.country ? ', ' + escapeHTML(data.country) : ''}</p>
                    </div>

                    <div class="skills">
                        <div class="section-title">SKILLS</div>
                        <ul>
                            ${data.skills.split(',').map(s => `<li>${escapeHTML(s.trim())}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="language">
                        <div class="section-title">LANGUAGE</div>
                        <p><span>English</span><span>(GOOD)</span></p>
                    </div>
                </div>

                <div class="right">
                    <div class="name">${escapeHTML(data.fullName)}</div>
                    <div class="role">${escapeHTML(data.title)}</div>

                    <div class="about">
                        <div class="section-title">ABOUT ME</div>
                        <p>${escapeHTML(data.summary).replace(/\\n/g, '<br>')}</p>
                    </div>

                    <div class="experience">
                        <div class="section-title">WORK EXPERIENCE</div>
            `;

            for (let i = 0; i < experiences.length; i++) {
                const exp = experiences[i];
                if (!exp.company.trim()) continue;
                let durationStr = `${exp.startMonth} ${exp.startYear} - ${exp.current ? 'Present' : exp.endMonth + ' ' + exp.endYear}`;
                htmlStr += `
                        <div class="job">
                            <div class="job-header">
                                <span>${escapeHTML(exp.role)}</span>
                                <span>${escapeHTML(durationStr)}</span>
                            </div>
                            <div class="company">${escapeHTML(exp.company)}</div>
                            <div class="exp-desc">${exp.description}</div>
                            <div class="divider"></div>
                        </div>
                `;
            }

            htmlStr += `
                    </div>

                    <!-- EDUCATION -->
                    <div class="education">
                        <div class="section-title">EDUCATION</div>
            `;

            for (let i = 0; i < education.length; i++) {
                const edu = education[i];
                if (!edu.school.trim()) continue;
                htmlStr += `
                        <div class="edu">
                            <div class="edu-header">
                                <span>${escapeHTML(edu.degree)}</span>
                                <span>${escapeHTML(edu.gradMonth + ' ' + edu.gradYear)}</span>
                            </div>
                            <div class="institute">${escapeHTML(edu.school)}</div>
                            <p>${escapeHTML(edu.fieldOfStudy)}</p>
                            <div class="divider"></div>
                        </div>
                `;
            }

            // You could optionally loop projects below education if wanted, 
            // but the provided template only has Experience and Education in the right column.

            htmlStr += `
                    </div>
                </div>
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
                            <div class="prof-text">${escapeHTML(data.summary)}</div>
                        </div>
                        
                        <div class="prof-section">
                            <div class="prof-section-title">Work Experience</div>
            `;
            for (let i = 0; i < experiences.length; i++) {
                const exp = experiences[i];
                if(!exp.company.trim()) continue;
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
            for(let i=0; i < education.length; i++){
                const edu = education[i];
                if(!edu.school.trim()) continue;
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
                        <div class="prof-section">
                            <div class="prof-section-title">Projects</div>
            `;
            for(let i=0; i < projNames.length; i++){
                if(!projNames[i].trim()) continue;
                htmlStr += `
                    <div class="prof-item">
                        <div class="prof-item-title">${escapeHTML(projNames[i])}</div>
                        <div class="prof-item-meta">Tech: ${escapeHTML(projTechs[i])}</div>
                        <div class="prof-text">${escapeHTML(projDescs[i]).replace(/\\n/g, '<br>')}</div>
                    </div>
                `;
            }

            htmlStr += `
                        </div>
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
                    </div>
                </div>
            `;
        } else {
            // Original logic for Classic, Creative
            htmlStr += `
                <div class="cv-header">
                    <div class="cv-name">${escapeHTML(data.fullName)}</div>
                    <div class="cv-contact">
                        <span>${escapeHTML(data.email)}</span> | 
                        <span>${escapeHTML(data.phone)}</span>
                    </div>
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
                if(!exp.company.trim()) continue; // Skip empty
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
            for(let i=0; i < education.length; i++){
                const edu = education[i];
                if(!edu.school.trim()) continue;
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
                <div class="cv-section">
                    <div class="cv-section-title">Projects</div>
            `;
            for(let i=0; i < projNames.length; i++){
                if(!projNames[i].trim()) continue;
                htmlStr += `
                    <div class="cv-item">
                        <div class="cv-item-header">
                            <div class="cv-item-title">${escapeHTML(projNames[i])}</div>
                            <div class="cv-item-date">Technologies: ${escapeHTML(projTechs[i])}</div>
                        </div>
                        <div class="cv-item-desc">${escapeHTML(projDescs[i]).replace(/\\n/g, '<br>')}</div>
                    </div>
                `;
            }
            htmlStr += `</div>`;
        }

        // 4. Inject into DOM
        resumeDoc.innerHTML = htmlStr;

        // Apply selected template class
        resumeDoc.className = 'resume-document template-' + data.template;

        // 5. Navigate to preview
        navigateTo('preview');
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
                    if (userDoc.exists() && userDoc.data().premium === true) {
                        isPremium = true;
                    }
                } catch (error) {
                    console.error("Error checking premium status:", error);
                }
            }
            
            btnDownload.innerHTML = originalHtml;
            btnDownload.disabled = false;

            if (isPremium) {
                if (typeof window.triggerPDFDownload === 'function') {
                    window.triggerPDFDownload();
                }
            } else {
                if (typeof window.openPaymentModal === 'function') {
                    window.openPaymentModal();
                }
            }
        });
    }

    // This function will be called after successful payment (future integration)
    window.triggerPDFDownload = function() {
        const element = document.getElementById('resume-document');
        
        // Setup PDF options
        const opt = {
            margin:       0,
            filename:     'my_resume.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // Generate and download
        html2pdf().set(opt).from(element).save();
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
    window.openPaymentModal = function() {
        if (paymentModal) {
            paymentModal.classList.add('active');
        }
    };

    window.closePaymentModal = function() {
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
                    key: "rzp_test_dummykey123456", // Test Key
                    amount: amountValue, // Amount in paise
                    currency: "INR",
                    name: "ResumeForge",
                    description: "Unlock Resume Download",
                    handler: async function (response) {
                        // Step 1: mark user as premium
                        const user = auth.currentUser;
                        if (user) {
                            try {
                                const userRef = doc(db, "users", user.uid);
                                await setDoc(userRef, {
                                    premium: true,
                                    plan: "monthly",
                                    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
                                }, { merge: true });
                            } catch (error) {
                                console.error("Error setting premium status:", error);
                            }
                        }

                        // Step 2: show success message
                        alert("Payment successful! You can now download your resume.");

                        // Step 3: trigger download
                        window.closePaymentModal();
                        if (typeof window.triggerPDFDownload === 'function') {
                            window.triggerPDFDownload();
                        }
                    },
                    prefill: {
                        name: "Applicant Name",
                        email: "applicant@example.com",
                        contact: "9999999999"
                    },
                    theme: {
                        color: "#6366f1"
                    }
                };
                
                const rzp1 = new Razorpay(options);
                rzp1.on('payment.failed', function (response){
                    alert("Payment failed: " + response.error.description);
                });
                rzp1.open();
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
                
                if (pendingPaymentPrompt) {
                    pendingPaymentPrompt = false;
                    setTimeout(() => {
                        if (typeof window.openPaymentModal === 'function') {
                            window.openPaymentModal();
                        }
                    }, 500); // short delay to allow auth state UI updates
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

                const resumesRef = collection(db, "users", currentUser.uid, "resumes");
                await addDoc(resumesRef, {
                    ...currentResumeData,
                    createdAt: serverTimestamp()
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
