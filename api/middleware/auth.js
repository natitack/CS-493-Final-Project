function requireAuthorization(req, res, next) {
  //console.log(req.headers);

  try {
    //console.log(req);
    const auth_value = req.get("Authorization");
    console.log(auth_value);
    if (!auth_value) {
      return res.status(401).send({ error: "Authorization header is missing" });
    }
    const token = auth_value.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
      next();
    } catch (err) {
      return res.status(401).send({ error: "Verification Failed" });
    }
  } catch (err) {
    console.log(err);
  }
}
