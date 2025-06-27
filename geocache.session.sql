-- @block
CREATE TABLE Users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    password VARCHAR(255),
    googleId VARCHAR(255),
    CHECK (password IS NOT NULL OR googleId IS NOT NULL)
);

-- @block
CREATE TABLE Routes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    owner_id INT,
    thumbnail VARCHAR(255),
    FOREIGN KEY (owner_id) 
        REFERENCES Users(id)
        ON DELETE CASCADE
);

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
);

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
);

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
);

CREATE TABLE LeaderboardWaypointsWithMostVisits(
    id INT PRIMARY KEY AUTO_INCREMENT,
    waypoint_id INT NOT NULL UNIQUE,
    visits INT NOT NULL DEFAULT 0,
    FOREIGN KEY (waypoint_id)
        REFERENCES Waypoints(id)
        ON DELETE CASCADE
);

CREATE TABLE LeaderboardUsersWithMostVisits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    visits INT NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id)
        REFERENCES Users(id)
        ON DELETE CASCADE
);

CREATE TABLE LeaderboardUsersWithMostCompletedRoutes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    completed_routes INT NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id)
        REFERENCES Users(id)
        ON DELETE CASCADE
);

CREATE TABLE Achievements(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(255)
);

CREATE TABLE UserAchievements(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    FOREIGN KEY (user_id)
        REFERENCES Users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (achievement_id)
        REFERENCES Achievements(id)
        ON DELETE CASCADE,
    UNIQUE(user_id, achievement_id)
);



-- INSERT TRIGGERS



-- @block
DELIMITER //

CREATE TRIGGER trg_after_visit_insert
AFTER INSERT ON Visits
FOR EACH ROW
BEGIN
  INSERT INTO LeaderboardUsersWithMostVisits (user_id, visits)
  VALUES (NEW.user_id, 1)
  ON DUPLICATE KEY UPDATE visits = visits + 1;
END;
//

DELIMITER ;

-- @block
DELIMITER //

CREATE TRIGGER trg_after_visit_insert_waypoint
AFTER INSERT ON Visits
FOR EACH ROW
BEGIN
  INSERT INTO LeaderboardWaypointsWithMostVisits (waypoint_id, visits)
  VALUES (NEW.waypoint_id, 1)
  ON DUPLICATE KEY UPDATE visits = visits + 1;
END;
//

DELIMITER ;

-- @block
DELIMITER //

CREATE TRIGGER after_visits_insert_check_completed_routes
AFTER INSERT ON Visits
FOR EACH ROW
BEGIN
    DECLARE total_wp INT;
    DECLARE visited_wp INT;

    -- route_id of the waypoint
    DECLARE route INT;
    SELECT route_id INTO route FROM Waypoints WHERE id = NEW.waypoint_id;

    -- total count of waypoints on this route
    SELECT COUNT(*) INTO total_wp FROM Waypoints WHERE route_id = route;

    -- count of unique waypoints on this route visited by the user
    SELECT COUNT(*) INTO visited_wp 
    FROM Visits V
    JOIN Waypoints W ON V.waypoint_id = W.id
    WHERE V.user_id = NEW.user_id AND W.route_id = route;

    IF visited_wp = total_wp THEN
        INSERT INTO LeaderboardUsersWithMostCompletedRoutes (user_id, completed_routes)
        VALUES (NEW.user_id, 1)
        ON DUPLICATE KEY UPDATE completed_routes = completed_routes + 1;
    END IF;
END;
//
DELIMITER ;



-- DELETE TRIGGERS


DELIMITER //

CREATE PROCEDURE AfterWaypointDelete(IN wp_id INT, IN route INT)
BEGIN
  DECLARE wp_count INT;

  -- 1. delete waypoint from waypoint leaderboard
  DELETE FROM LeaderboardWaypointsWithMostVisits
  WHERE waypoint_id = wp_id;

  -- 2. decrease visits in user leaderboard (delete if 0)
  UPDATE LeaderboardUsersWithMostVisits
  SET visits = visits - 1
  WHERE user_id IN (
    SELECT user_id FROM Visits WHERE waypoint_id = wp_id
  );

  DELETE FROM LeaderboardUsersWithMostVisits
  WHERE visits <= 0;

  -- 3. check if after waypoint deletion someone has completed the route
  -- remaining number of waypoints in the route
  SELECT COUNT(*) INTO wp_count FROM Waypoints WHERE route_id = route;

  -- 4. for users who have not visited the deleted waypoint but now visited all remaining waypoints in that route
  INSERT INTO LeaderboardUsersWithMostCompletedRoutes (user_id, completed_routes)
  SELECT user_id, 1
  FROM (
    SELECT V.user_id
    FROM Visits V
    JOIN Waypoints W ON V.waypoint_id = W.id
    WHERE W.route_id = route
      AND W.id != wp_id
    GROUP BY V.user_id
    HAVING COUNT(DISTINCT W.id) = wp_count - 1  -- user has visited all remaining waypoints
      AND V.user_id NOT IN (
        SELECT user_id FROM Visits WHERE waypoint_id = wp_id  -- didn't visit deleted waypoint
      )
      AND V.user_id NOT IN (
        SELECT user_id
        FROM (
          SELECT V.user_id
          FROM Visits V
          JOIN Waypoints W ON V.waypoint_id = W.id
          WHERE W.route_id = route
          GROUP BY V.user_id
          HAVING COUNT(DISTINCT W.id) + 1 = wp_count + 1  -- already completed before
        ) AS AlreadyCompleted
      )
  ) AS NewlyCompleted
  ON DUPLICATE KEY UPDATE completed_routes = completed_routes + 1;

  -- 5. delete the route if it has 0 waypoints after deletion
  SELECT COUNT(*) INTO wp_count FROM Waypoints WHERE route_id = route;

  IF wp_count = 1 THEN
    DELETE FROM Routes WHERE id = route;
  END IF;

END;
//

DELIMITER ;


DELIMITER //

CREATE TRIGGER trg_after_waypoint_delete
BEFORE DELETE ON Waypoints
FOR EACH ROW
BEGIN
  CALL AfterWaypointDelete(OLD.id, OLD.route_id);
END;
//

DELIMITER ;

DELIMITER //

CREATE TRIGGER trg_before_route_delete
BEFORE DELETE ON Routes
FOR EACH ROW
BEGIN
  DECLARE wp_count INT;

  -- 1. number of waypoints on this route
  SELECT COUNT(*) INTO wp_count FROM Waypoints WHERE route_id = OLD.id;

  -- 2. decrease number of completed_routes if someone has completed it
  UPDATE LeaderboardUsersWithMostCompletedRoutes L
  JOIN (
    SELECT V.user_id
    FROM Visits V
    JOIN Waypoints W ON V.waypoint_id = W.id
    WHERE W.route_id = OLD.id
    GROUP BY V.user_id
    HAVING COUNT(DISTINCT W.id) = wp_count
  ) AS Completed ON L.user_id = Completed.user_id
  SET L.completed_routes = L.completed_routes - 1;

  -- 3. delete user from completed leaderboard if has 0
  DELETE FROM LeaderboardUsersWithMostCompletedRoutes
  WHERE completed_routes <= 0;
END;
//

DELIMITER ;



-- @block
SELECT w.name, w.latitude, w.longitude, visits
FROM LeaderboardWaypointsWithMostVisits lw
JOIN Waypoints w ON lw.waypoint_id = w.id
ORDER BY visits DESC;


-- @block
SELECT u.username, l.visits
FROM LeaderboardUsersWithMostVisits l
JOIN Users u ON l.user_id = u.id
ORDER BY visits DESC
LIMIT 10;