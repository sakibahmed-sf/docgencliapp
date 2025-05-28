import express from "express";
import path from "path";
import https from "https";
import fs from "fs";

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const options = {
  key: fs.readFileSync(
    path.join(import.meta.dirname, "..", "certs", "key.pem")
  ), // Replace with the path to your private key
  cert: fs.readFileSync(
    path.join(import.meta.dirname, "..", "certs", "cert.pem")
  ), // Replace with the path to your certificate
};

app.use(express.static(path.join(import.meta.dirname, "..", "dist")));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.post("/callback", async (req, res) => {
  const data = req.body;

  fs.writeFileSync(
    path.join(import.meta.dirname, "..", "dist", "callback.json"),
    JSON.stringify(req.body, null, 2)
  );

  res.send({ message: "Authentication successful!" });
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

https.createServer(options, app).listen(port, () => {
  // console.log(`Server is running at https://localhost:${port}`);
});
