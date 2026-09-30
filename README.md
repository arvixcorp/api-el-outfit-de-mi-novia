# Finish installing template

To get started, just clone the repository:

https://github.com/infinityprojectcode/template-back.git

And run:

```bash
npm install
```

Add the environment variables to the .env (remember, GitHub will ignore the .env, it will only show it once so you can download the template, when you go to modify the file, GitHub will ignore it)

The "vercel.json" file is used to set up the backend in Vercel, but this file is optional if you're using Vercel. If you don't use it, simply delete it.

Create a ".env" file and copy and paste the contents of ".env.example" into the ".env" file. You can then delete the ".env.example" file. GitHub will now ignore the ".env" file. It is extremely important to never allow GitHub to track the ".env" file, so you should not remove the ".gitignore" file.

# Files to modify

You are free to modify paths, functions, and variables, such as:

- ## response.auth.js / response.jwt.js / response.queries.js:

These are located in each of their corresponding folders [auth / jwt / queries], which are located in the path "src/common/enum/[folder name]/[file name]".

- ## database.js:

Here you can modify the error message returned by the "console.error" of the "catch". Its path is "src/config/database.js".

- ## Controllers folder:

Here is a "test.controller.js" file, but you are free to create as many files as you need for your project. The current file contains a simple CRUD function, which you can modify as needed. Its path is "src\controllers".

- ## connection.controller.js / connection.mysql.js:

"connection.controller.js" returns a positive connection status, indicating that it has already connected, but you can modify it as needed. The "connection.mysql.js" file is responsible for verifying the connection to the database. You can modify the "console.log" and "console.error" files. Its path is "src\database"

- ## Middleware Folder

"authorization.js" is responsible for obtaining the API_KEY from the ".env" and is used as middleware to authorize the endpoint. "connection.js" is responsible for verifying data integrity; its "console.error" or "JSON" messages can be modified. Its path is "src\middleware"

- ## Routes.js

This file contains the routes you can add and integrate based on the controller you created, in order to execute endpoints and obtain data. Its path is: src\routes\routes.js

- ## const.database.js

File where the .env of the database or databases to be accessed is configured, as it is an array, multiple databases can be added

- ## model.js

Uso totalmente exclusivo para la librería de Sequelize

- ## service.js

Uso totalmente exclusivo para MySQL2 con promise