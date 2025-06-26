```mermaid
---
title: Geocache E-R diagram
---
erDiagram
    direction LR
    USER zero or more optionally to zero or more ROUTE : "joins"
    USER only one to zero or more ROUTE : creates
    USER zero or more to zero or more ACHIEVEMENT : "earns"
    ROUTE only one to one or more WAYPOINT : "consists of"
    USER one or more optionally to one or more WAYPOINT : visits
    LeaderboardWaypointsWithMostVisitsEntry only one to only one USER : ""
    LeaderboardUsersWithMostVisitsEntry only one to only one USER : ""
    LeaderboardUsersWithMostCompletedRoutesEntry only one to only one USER : ""
```