document.getElementById("regForm").addEventListener("submit", function (e) {
  e.preventDefault(); // stops default page reload

  const user = document.getElementById("UserName").value;
  const pin = document.getElementById("Pin").value;
  const cnf = document.getElementById("CnfPin").value;

  if (pin !== cnf) {
    alert("PIN and Confirm PIN do not match!");
    return;
  } else {
    const noteUser = {
      UserName: user,
      pin: pin,
    };

    fetch("https://dyootify-server.vercel.app/post/notestaker/regUser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noteUser),
    })
      .then((response) => response.json())
      .then((data) => {
        alert("User Updated successfully!");
        window.location.href = "index.html";
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("An error occurred while saving the note.");
      });
  }
});
