document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault(); // stops default page reload

  const user = document.getElementById("UserName").value;
  const pin = document.getElementById("Pin").value;

  const noteUser = {
    userName: user,
    pin: pin,
    loginMode: true,
  };

  //   sessionStorage.setItem("gatePassKeyForNotes", pin);
  //   const gatePassKeyForNotes = sessionStorage.getItem("gatePassKeyForNotes");
  //   alert("Stored Username: " + gatePassKeyForNotes);

  fetch("https://dyootify-server.vercel.app/post/notestaker/regUser", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(noteUser),
  })
    .then((response) => response.json())
    .then((data) => {
      sessionStorage.setItem("gatePassKeyForNotes", data.passKey);
      sessionStorage.setItem("userNameForNotes", user);
      sessionStorage.setItem("pinForNotes", pin);
      alert("Status: " + data.message);
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred while registration.\nERROR: " + error);
    });
});

document
  .getElementById("createNote")
  .addEventListener("click", function (event) {
    event.preventDefault();
    if (sessionStorage.getItem("gatePassKeyForNotes")) {
      window.location.href = "newnote.html";
    } else {
      alert("Login First!!!");
    }
  });

document
  .getElementById("viewNotes")
  .addEventListener("click", function (event) {
    event.preventDefault();
    if (sessionStorage.getItem("gatePassKeyForNotes")) {
      window.location.href = "notes.html";
    } else {
      alert("Login First!!!");
    }
  });

document.getElementById("trouble").addEventListener("click", function (event) {
  event.preventDefault(); // prevent form submission

  // Show hidden elements
  document.getElementById("trouble").style.display = "none";
  document.getElementById("NewUser").style.display = "block";
  document.getElementById("ResetOTP").style.display = "block";
  document.querySelector('label[for="NewUser"]').style.display = "block";
  document.querySelector('label[for="ResetOTP"]').style.display = "block";
});

document.getElementById("NewUser").addEventListener("click", function (event) {
  event.preventDefault();
  window.location.href = "registeruser.html";
});

document.getElementById("ResetOTP").addEventListener("click", function (event) {
  event.preventDefault();
  alert("Please contact admin to reset OTP");
  window.location.href = "index.html";
});

document.getElementById("logout").addEventListener("click", function (event) {
  event.preventDefault();
  sessionStorage.setItem("gatePassKeyForNotes", "");
  window.location.href = "index.html";
});
