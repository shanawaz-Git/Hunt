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

document.getElementById("createNote").addEventListener("click", function () {
  const otp = document.getElementById("otp").value;
  if (otp == "1234") {
    window.location.href = "newnote.html";
  } else {
    alert("Invalid OTP!!!");
  }
});

document.getElementById("viewNotes").addEventListener("click", function () {
  const otp = document.getElementById("otp").value;
  if (otp == "1234") {
    window.location.href = "notes.html";
  } else {
    alert("Invalid OTP!!!");
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

document.getElementById("regForm").addEventListener("submit", function (event) {
  const UserName = document.getElementById("UserName").value;
  const pin = document.getElementById("Pin").value;
  const CnfPin = document.getElementById("CnfPin").value;
  if (pin != CnfPin) {
    alert("PIN and Confirm PIN should match!!");
  } else {
    const noteUser = {
      UserName: UserName,
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
