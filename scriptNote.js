document
  .getElementById("noteForm")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    const name = document.getElementById("name").value;
    const category = document.getElementById("category").value;
    const content = document.getElementById("content").value;
    const state = document.getElementById("state").value;
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
