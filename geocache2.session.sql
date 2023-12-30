-- @block
CREATE TABLE Users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    password VARCHAR(255),
    googleId VARCHAR(255),
    CHECK (password IS NOT NULL OR googleId IS NOT NULL)
)

-- @block
CREATE TABLE Routes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    owner_id INT,
    FOREIGN KEY (owner_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE
)

-- @block
CREATE TABLE Waypoints(
    id INT PRIMARY KEY AUTO_INCREMENT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    route_id INT,
    order_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    uuid VARCHAR(512),
    FOREIGN KEY (route_id) 
        REFERENCES Routes(id)
        ON DELETE CASCADE
)

-- @block
CREATE TABLE JoinedRoutes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    route_id INT NOT NULL,
    FOREIGN KEY (user_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (route_id) 
        REFERENCES Routes(id)
        ON DELETE CASCADE,
    UNIQUE(user_id, route_id)
)

-- @block
CREATE TABLE Visits(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    waypoint_id INT NOT NULL,
    FOREIGN KEY (user_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (waypoint_id)
        REFERENCES Waypoints(id)
        ON DELETE CASCADE,
    UNIQUE(user_id, waypoint_id)
)

-- @block
SELECT * FROM Users;