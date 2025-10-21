document.addEventListener("DOMContentLoaded", function () {
  const notesTableBody = document.querySelector("#notesTable tbody");
  const pageInfo = document.getElementById("pageInfo");
  let currentPage = 1;
  const notesPerPage = 25;
  let notes = [];

  function loadNotes(page) {
    fetch(
      `https://dyootify-server.vercel.app/notestaker/get?page=${page}&limit=${notesPerPage}`
    )
      .then((response) => response.json())
      .then((data) => {
        notes = data.notes; // Store the notes
        displayNotes(notes);
        pageInfo.textContent = `Page ${data.currentPage} of ${data.totalPages}`;

        document.getElementById("prevPage").disabled = data.currentPage === 1;
        document.getElementById("nextPage").disabled =
          data.currentPage === data.totalPages;
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("An error occurred while fetching the notes.");
      });
  }

  function displayNotes(notes) {
    notesTableBody.innerHTML = ""; // Clear any existing rows

    notes.forEach((note) => {
      const row = document.createElement("tr");
      row.innerHTML = `
                <td>${note.name}</td>
                <td>${note.cat}</td>
                <td>${note.content}</td>
                <td>${note.state}</td>
                <td>${note.time_stamp}</td>
                <td><button class="complete-btn" data-id="${note._id}">Complete</button></td>
            `;
      notesTableBody.appendChild(row);
    });

    // Add event listeners for the complete buttons
    document.querySelectorAll(".complete-btn").forEach((button) => {
      button.addEventListener("click", function () {
        const noteId = this.getAttribute("data-id");
        completeNote(noteId);
      });
    });
  }

  function filterNotes() {
    const filterName = document
      .getElementById("filterName")
      .value.toLowerCase();
    const filterCategory = document
      .getElementById("filterCategory")
      .value.toLowerCase();
    const filterContent = document
      .getElementById("filterContent")
      .value.toLowerCase();
    const filterState = document.getElementById("filterState").value;
    const filterTimestamp = document
      .getElementById("filterTimestamp")
      .value.toLowerCase();

    const filteredNotes = notes.filter((note) => {
      return (
        note.name.toLowerCase().includes(filterName) &&
        note.cat.toLowerCase().includes(filterCategory) &&
        note.content.toLowerCase().includes(filterContent) &&
        (filterState === "" || note.state === filterState) &&
        note.time_stamp.toLowerCase().includes(filterTimestamp)
      );
    });

    displayNotes(filteredNotes);
  }

  function completeNote(noteId) {
    fetch(`https://dyootify-server.vercel.app/post/notestaker/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noteId: noteId,
        state: "completed",
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Note marked as completed.");
          loadNotes(currentPage);
        } else {
          alert("Failed to update the note.");
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("An error occurred while updating the note.");
      });
  }

  document.getElementById("prevPage").addEventListener("click", function () {
    if (currentPage > 1) {
      currentPage--;
      loadNotes(currentPage);
    }
  });

  document.getElementById("nextPage").addEventListener("click", function () {
    currentPage++;
    loadNotes(currentPage);
  });

  document
    .getElementById("backToForm")
    .addEventListener("click", function (event) {
      event.preventDefault();
      if (sessionStorage.getItem("gatePassKeyForNotes")) {
        window.location.href = "newnote.html";
      } else {
        alert("Login First!!!");
        window.location.href = "index.html";
      }
    });

  // Add event listeners for filter inputs
  document.getElementById("filterName").addEventListener("input", filterNotes);
  document
    .getElementById("filterCategory")
    .addEventListener("input", filterNotes);
  document
    .getElementById("filterContent")
    .addEventListener("input", filterNotes);
  document
    .getElementById("filterState")
    .addEventListener("change", filterNotes);
  document
    .getElementById("filterTimestamp")
    .addEventListener("input", filterNotes);

  loadNotes(currentPage);
});
