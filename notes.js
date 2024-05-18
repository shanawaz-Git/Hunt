document.addEventListener("DOMContentLoaded", function () {
  const notesTableBody = document.querySelector("#notesTable tbody");
  const pageInfo = document.getElementById("pageInfo");
  let currentPage = 1;
  const notesPerPage = 10;

  function loadNotes(page) {
    fetch(
      `https://dyootify-server.vercel.app/notestaker/get?page=${page}&limit=${notesPerPage}`
    )
      .then((response) => response.json())
      .then((data) => {
        notesTableBody.innerHTML = ""; // Clear any existing rows

        data.notes.forEach((note) => {
          const row = document.createElement("tr");
          row.innerHTML = `
                        <td>${note.name}</td>
                        <td>${note.cat}</td>
                        <td>${note.content}</td>
                        <td>${note.state}</td>
                        <td>${note.time_stamp}</td>
                    `;
          notesTableBody.appendChild(row);
        });

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

  document.getElementById("backToForm").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  loadNotes(currentPage);
});
