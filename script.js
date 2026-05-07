const dealers = [
  { name: "Bean", image: "dealer1.png" },
  { name: "LJ", image: "dealer2.png" },
  { name: "WillYum", image: "dealer3.png" },
  { name: "Great Clips", image: "dealer4.png" },
  { name: "Bob Ross", image: "dealer6.png" },
  { name: "Big Sexy", image: "dealer7.jpg" },
  { name: "Shamu 🐋", image: "dealer5.png" }
];

let dealerIndex = 0;

function rotateDealer() {
  dealerIndex++;

  if (dealerIndex >= dealers.length) {
    dealerIndex = 0;
  }

  document.getElementById("dealerImage").src =
    dealers[dealerIndex].image;

  document.getElementById("dealerName").innerText =
    dealers[dealerIndex].name;
}

setInterval(rotateDealer, 5000);

console.log("Bean Casino loaded.");
