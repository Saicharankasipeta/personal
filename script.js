
/* IMPORTANT: Use your real Supabase Project URL and Publishable key. */
const SUPABASE_URL = "https://kflffrhzcsoyotkvbkym.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vQy7JBCqr3SrlGXA_cBeJQ_OpPJ2Kay";

const loginPage = document.getElementById("loginPage");
const vaultPage = document.getElementById("vaultPage");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const uploadMessage = document.getElementById("uploadMessage");
const fileInput = document.getElementById("fileInput");
const fileSection = document.getElementById("fileSection");
const fileList = document.getElementById("fileList");
const viewer = document.getElementById("photoViewer");
const viewerImage = document.getElementById("viewerImage");

let currentCategory = "Photos";

function setMessage(element, text, color = "white") {
    element.textContent = text;
    element.style.color = color;
}

function showVault(user) {
    loginPage.classList.remove("active");
    vaultPage.classList.add("active");
    document.getElementById("userEmail").textContent =
        "Logged in as: " + (user.email || "");
}

function showLogin() {
    vaultPage.classList.remove("active");
    loginPage.classList.add("active");
    closeFiles();
    closePhotoViewer();
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    })[ch]);
}

function getClient() {
    if (!window.supabase) {
        throw new Error(
            "Supabase library did not load. Check your internet connection."
        );
    }

    if (
        SUPABASE_URL.includes("PASTE_YOUR") ||
        SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR")
    ) {
        throw new Error("Add your real Supabase URL and Publishable key in script.js.");
    }

    return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );
}

let supabaseClient;

try {
    supabaseClient = getClient();
} catch (error) {
    console.error(error);
    setMessage(loginMessage, error.message, "#ff7aa8");
}

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!supabaseClient) return;

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const button = document.getElementById("loginButton");

    button.disabled = true;
    setMessage(loginMessage, "Connecting to Supabase...");

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) throw error;

        setMessage(loginMessage, "Vault unlocked!", "#7cff9b");
        showVault(data.user);
    } catch (error) {
        console.error("Login failed:", error);
        setMessage(loginMessage, "Login failed: " + error.message, "#ff7aa8");
    } finally {
        button.disabled = false;
    }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
    if (!supabaseClient) return;

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert("Logout failed: " + error.message);
        return;
    }

    document.getElementById("password").value = "";
    setMessage(loginMessage, "");
    showLogin();
});

async function getUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Please log in again.");
    return data.user;
}

async function uploadFile() {
    if (!supabaseClient) return;

    const category = document.getElementById("categorySelect").value;
    const files = Array.from(fileInput.files);

    if (!files.length) {
        setMessage(uploadMessage, "Select one or more files first.", "#ff7aa8");
        return;
    }

    const button = document.getElementById("uploadButton");
    button.disabled = true;

    try {
        const user = await getUser();
        let succeeded = 0;
        const failures = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const uniqueName = `${Date.now()}_${i}_${safeName}`;
            const path = `${user.id}/${category}/${uniqueName}`;

            setMessage(
                uploadMessage,
                `Uploading ${i + 1} of ${files.length}: ${file.name}`
            );

            const { error } = await supabaseClient.storage
                .from("vault")
                .upload(path, file, { upsert: false, cacheControl: "3600" });

            if (error) {
                console.error("Upload error:", file.name, error);
                failures.push(file.name);
            } else {
                succeeded++;
            }
        }

        fileInput.value = "";

        if (!failures.length) {
            setMessage(uploadMessage, `Uploaded ${succeeded} file(s) successfully!`, "#7cff9b");
        } else {
            setMessage(
                uploadMessage,
                `${succeeded} uploaded; ${failures.length} failed. See browser console.`,
                "#ff7aa8"
            );
        }

        await showFiles(category);
    } catch (error) {
        console.error(error);
        setMessage(uploadMessage, error.message, "#ff7aa8");
    } finally {
        button.disabled = false;
    }
}

document.getElementById("uploadButton").addEventListener("click", uploadFile);

document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => showFiles(button.dataset.category));
});

async function showFiles(category) {
    if (!supabaseClient) return;

    currentCategory = category;
    fileSection.hidden = false;

    document.getElementById("fileSectionTitle").textContent =
        category === "Photos" ? "📸 Photos" :
        category === "Documents" ? "📄 Documents" : "🔒 Personal";

    fileList.innerHTML = '<p class="empty-message">Loading files...</p>';

    try {
        const user = await getUser();
        const folder = `${user.id}/${category}`;

        const { data: files, error } = await supabaseClient.storage
            .from("vault")
            .list(folder, {
                limit: 100,
                sortBy: { column: "created_at", order: "desc" }
            });

        if (error) throw error;

        const actualFiles = (files || []).filter(file => file.name);

        if (!actualFiles.length) {
            fileList.innerHTML = '<p class="empty-message">No files here yet.</p>';
            return;
        }

        if (category === "Photos") {
            await displayGallery(user.id, actualFiles);
        } else {
            displayFileList(actualFiles, category);
        }
    } catch (error) {
        console.error(error);
        fileList.innerHTML =
            `<p class="empty-message">${escapeHTML(error.message)}</p>`;
    }
}

async function displayGallery(userId, files) {
    fileList.innerHTML = "";
    const gallery = document.createElement("div");
    gallery.className = "photo-gallery";

    const images = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name)
    );

    for (const file of images) {
        const path = `${userId}/Photos/${file.name}`;

        const { data, error } = await supabaseClient.storage
            .from("vault")
            .createSignedUrl(path, 3600);

        if (error) {
            console.error("Could not create photo URL:", error);
            continue;
        }

        const card = document.createElement("div");
        card.className = "photo-card";

        const image = document.createElement("img");
        image.src = data.signedUrl;
        image.alt = file.name;
        image.loading = "lazy";
        image.addEventListener("click", () => openPhotoViewer(data.signedUrl));

        const deleteButton = document.createElement("button");
        deleteButton.className = "photo-delete";
        deleteButton.textContent = "🗑️";
        deleteButton.setAttribute("aria-label", "Delete photo");
        deleteButton.addEventListener("click", event => {
            event.stopPropagation();
            deleteFile("Photos", file.name);
        });

        card.append(image, deleteButton);
        gallery.appendChild(card);
    }

    if (!gallery.children.length) {
        fileList.innerHTML =
            '<p class="empty-message">No supported photos found.</p>';
        return;
    }

    fileList.appendChild(gallery);
}

function displayFileList(files, category) {
    fileList.innerHTML = "";

    for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = file.name;

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const download = document.createElement("button");
        download.className = "download-btn";
        download.textContent = "⬇️ Download";
        download.addEventListener("click", () => downloadFile(category, file.name));

        const remove = document.createElement("button");
        remove.className = "delete-btn";
        remove.textContent = "🗑️ Delete";
        remove.addEventListener("click", () => deleteFile(category, file.name));

        actions.append(download, remove);
        item.append(name, actions);
        fileList.appendChild(item);
    }
}

async function downloadFile(category, fileName) {
    try {
        const user = await getUser();
        const path = `${user.id}/${category}/${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from("vault")
            .createSignedUrl(path, 300, { download: fileName });

        if (error) throw error;

        window.open(data.signedUrl, "_blank", "noopener");
    } catch (error) {
        console.error(error);
        alert("Download failed: " + error.message);
    }
}

async function deleteFile(category, fileName) {
    if (!confirm(`Delete "${fileName}" permanently?`)) return;

    try {
        const user = await getUser();
        const path = `${user.id}/${category}/${fileName}`;

        const { error } = await supabaseClient.storage
            .from("vault")
            .remove([path]);

        if (error) throw error;

        await showFiles(category);
    } catch (error) {
        console.error(error);
        alert("Delete failed: " + error.message);
    }
}

function openPhotoViewer(url) {
    viewerImage.src = url;
    viewer.hidden = false;
}

function closePhotoViewer() {
    viewer.hidden = true;
    viewerImage.src = "";
}

document.getElementById("viewerCloseButton").addEventListener("click", closePhotoViewer);
viewer.addEventListener("click", event => {
    if (event.target === viewer) closePhotoViewer();
});
document.getElementById("closeFilesButton").addEventListener("click", () => {
    fileSection.hidden = true;
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePhotoViewer();
});

async function restoreSession() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (data.session) showVault(data.session.user);
    } catch (error) {
        console.error("Session restore failed:", error);
    }
}

restoreSession();
