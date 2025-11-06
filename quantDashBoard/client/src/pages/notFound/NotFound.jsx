import { Link } from "react-router-dom";
import "./NotFound.css";

export default function NotFound() {
  return (
    <div>
      <h1>404 - Page Not Found</h1>
      <p>
        Lorem ipsum dolor sit, amet consectetur adipisicing elit. Neque
        repellendus quo tenetur inventore. Asperiores eos voluptas minus rem
        veniam ea nihil cum numquam eveniet quaerat dignissimos corrupti alias,
        ab incidunt.
      </p>
      <p>
        Go to <Link to="/">Home Page</Link>.
      </p>
    </div>
  );
}
