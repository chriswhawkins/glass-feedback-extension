const reason = new URLSearchParams(location.search).get("reason");
if (reason) {
  const detail = document.getElementById("reason");
  detail.textContent = `Chrome reported: ${reason}`;
  detail.hidden = false;
}
