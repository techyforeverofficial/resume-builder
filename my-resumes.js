import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, doc, getDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const dropdown = document.getElementById("dropdownMenu");
const profileBtn = document.getElementById("profileBtn");
const grid = document.getElementById("resumeGrid");
const createNewBtn = document.getElementById("createNew");

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (dropdown) {
            dropdown.innerHTML = `
                <div class="dropdown-item" id="myResumes">My Resumes</div>
                <div class="dropdown-item" id="logout">Logout</div>
            `;

            document.getElementById("logout").onclick = () => {
                signOut(auth).then(() => {
                    window.location.href = "index.html";
                });
            };

            document.getElementById("myResumes").onclick = () => {
                window.location.href = "my-resumes.html";
            };
        }
        
        loadResumes(user);

    } else {
        // Redirect to home if not logged in
        window.location.href = "index.html";
    }
});

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

if (createNewBtn) {
    createNewBtn.onclick = () => {
        window.location.href = "index.html"; 
    };
}

async function loadResumes(user) {
    if (!user) return;

    try {
        const q = query(
            collection(db, "resumes"),
            where("userId", "==", user.uid),
            orderBy("updatedAt", "desc")
        );

        const snapshot = await getDocs(q);
        grid.innerHTML = "";

        if (snapshot.empty) {
            grid.innerHTML = "<p style='color: var(--text-secondary); grid-column: 1 / -1; text-align: center; padding: 2rem;'>No resumes found. Create your first resume now!</p>";
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();

            const card = document.createElement("div");
            card.className = "resume-card";

            let dateStr = "Recently";
            if (data.updatedAt) {
                // Determine if it's a Firestore Timestamp or normal Date
                const dateObj = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
                dateStr = dateObj.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric', 
                    hour: '2-digit', minute: '2-digit'
                });
            }

            const templateName = data.templateId || "modern";
            const resumeName = data.name || "Untitled Resume";

            card.innerHTML = `
                <img src="templates/${templateName}.webp" onerror="this.src='https://via.placeholder.com/300x400?text=No+Preview'" alt="Template Preview" />
                <h3>${resumeName}</h3>
                <p>Updated: ${dateStr}</p>

                <div class="actions">
                    <button data-id="${doc.id}" class="edit">Edit</button>
                    <button data-id="${doc.id}" class="download">Download</button>
                    <button data-id="${doc.id}" class="duplicate">Duplicate</button>
                    <button data-id="${doc.id}" class="delete">Delete</button>
                </div>
            `;

            grid.appendChild(card);

            // Bind Actions
            const editBtn = card.querySelector(".edit");
            const deleteBtn = card.querySelector(".delete");
            const duplicateBtn = card.querySelector(".duplicate");

            if (editBtn) {
                editBtn.onclick = (e) => {
                    const id = e.target.dataset.id;
                    localStorage.setItem("editResumeId", id);
                    window.location.href = "index.html"; 
                };
            }

            if (deleteBtn) {
                deleteBtn.onclick = async (e) => {
                    const id = e.target.dataset.id;
                    const confirmDelete = confirm("Delete this resume?");
                    if (!confirmDelete) return;

                    try {
                        e.target.innerText = "Deleting...";
                        e.target.disabled = true;
                        
                        await deleteDoc(doc(db, "resumes", id));
                        e.target.closest(".resume-card").remove();
                    } catch (err) {
                        console.error("Error deleting", err);
                        alert("Failed to delete");
                        e.target.innerText = "Delete";
                        e.target.disabled = false;
                    }
                };
            }

            if (duplicateBtn) {
                duplicateBtn.onclick = async (e) => {
                    const id = e.target.dataset.id;
                    
                    try {
                        e.target.innerText = "Duplicating...";
                        e.target.disabled = true;
                        
                        const original = await getDoc(doc(db, "resumes", id));
                        if (!original.exists()) return;
                        
                        const ogData = original.data();
                        await addDoc(collection(db, "resumes"), {
                            ...ogData,
                            name: (ogData.name || "Resume") + " Copy",
                            updatedAt: new Date()
                        });
                        
                        location.reload();
                    } catch (err) {
                        console.error("Error duplicating", err);
                        alert("Failed to duplicate");
                        e.target.innerText = "Duplicate";
                        e.target.disabled = false;
                    }
                };
            }
        });
        
    } catch (error) {
        console.error("Error fetching resumes:", error);
        
        // This handles cases where index needs to be created in Firestore
        if (error.message && error.message.includes("index")) {
            grid.innerHTML = `<p style='color: var(--danger-color); grid-column: 1 / -1; padding: 1rem; border: 1px solid var(--danger-color); border-radius: 8px;'>Database requires an index. Check the console for the link to create it.</p>`;
        } else {
            grid.innerHTML = "<p style='color: var(--danger-color); grid-column: 1 / -1;'>Failed to load resumes. Please try again later.</p>";
        }
    }
}
