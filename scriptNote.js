document
  .getElementById("noteForm")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    const name = document.getElementById("name").value;
    const category = document.getElementById("category").value;
    const content = document.getElementById("content").value;
    const state = document.getElementById("state").value;
    const eta = document.getElementById("eta").value;
    const now = new Date();
    const timestamp = new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "long",
      timeZone: "Asia/Kolkata",
    }).format(now);

    const note = {
      name: name,
      cat: category,
      content: content,
      state: state,
      time_stamp: timestamp,
      eta: eta,
    };

    fetch("https://dyootify-server.vercel.app/post/notestaker/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(note),
    })
      .then((response) => response.json())
      .then((data) => {
        alert("Note saved successfully!");
        window.location.href = "notes.html";
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("An error occurred while saving the note.");
      });
  });

document
  .getElementById("viewNotes")
  .addEventListener("click", function (event) {
    event.preventDefault();
    if (sessionStorage.getItem("gatePassKeyForNotes")) {
      window.location.href = "notes.html";
    } else {
      alert("Login First!!!");
      window.location.href = "index.html";
    }
  });

document.getElementById("logout").addEventListener("click", function (event) {
  event.preventDefault();
  sessionStorage.setItem("gatePassKeyForNotes", "");
  window.location.href = "index.html";
});
