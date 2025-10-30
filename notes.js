document.addEventListener("DOMContentLoaded", function () {
  const notesTableBody = document.querySelector("#notesTable tbody");
  const pageInfo = document.getElementById("pageInfo");
  let currentPage = 1;
  const notesPerPage = 25;
  let notes = [];

  function loadNotes(page) {
    if (!sessionStorage.getItem("gatePassKeyForNotes")) {
      alert("session ended, please login!!!");
      window.location.href = "index.html";
      return;
    }
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

      var clr = "";
      const today = new Date();
      const targetDate = new Date(note.eta);

      // Calculate difference in days
      const diffTime = targetDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Apply background color based on the remaining days
      if (diffDays === 2) {
        clr = "orange";
      } else if (diffDays === 1) {
        clr = "red";
      } else if (diffDays > 3) {
        clr = "green";
      }

      if (note.state == "active") {
        row.innerHTML = `
                <td>${note.name}</td>
                <td>${note.cat}</td>
                <td>${note.content}</td>
                <td>${note.state}</td>
                <td style="color: ${clr}">${note.eta}</td>
                <td><button class="complete-btn" data-id="${note._id}">Complete</button></td>
                <td></td>
            `;
      } else {
        row.innerHTML = `
                <td>${note.name}</td>
                <td>${note.cat}</td>
                <td>${note.content}</td>
                <td>${note.state}</td>
                <td>${note.eta}</td>
                <td><button class="incomplete-btn" data-id="${note._id}">Revert</button></td>
                <td><button class="deleteNote" data-id="${note._id}">🗑️</button></td>
            `;
      }
      notesTableBody.appendChild(row);
    });

    // Add event listeners for the complete buttons
    document.querySelectorAll(".complete-btn").forEach((button) => {
      button.addEventListener("click", function () {
        var result = confirm(
          'Click "OK" if the note is completed successfully.\n Click "CANCEL" if the note is closed incompletely.'
        );
        const noteId = this.getAttribute("data-id");
        completeNote(noteId, result);
      });
    });

    document.querySelectorAll(".incomplete-btn").forEach((button) => {
      button.addEventListener("click", function () {
        const noteId = this.getAttribute("data-id");
        incompleteNote(noteId);
      });
    });

    document.querySelectorAll(".deleteNote").forEach((button) => {
      button.addEventListener("click", function () {
        var result = confirm(
          'Note will be deleted permanently!!! \n Click "OK" to continue...'
        );
        const noteId = this.getAttribute("data-id");
        if (result) deleteNote(noteId);
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

  function completeNote(noteId, result) {
    fetch(`https://dyootify-server.vercel.app/post/notestaker/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noteId: noteId,
        state: result ? "Closed Complete" : "Closed Incomplete",
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Note marked as closed.");
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

  function deleteNote(noteId) {
    fetch(`https://dyootify-server.vercel.app/post/notestaker/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noteId: noteId,
        deleteNote: true,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Note Deleted Successfully.");
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
  function incompleteNote(noteId) {
    fetch(`https://dyootify-server.vercel.app/post/notestaker/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noteId: noteId,
        state: "active",
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Note marked as Active again.");
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

document.getElementById("logout").addEventListener("click", function (event) {
  event.preventDefault();
  sessionStorage.setItem("gatePassKeyForNotes", "");
  window.location.href = "index.html";
});
