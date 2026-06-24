package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.DailyTotalsResponse;
import com.suivibaby.model.TotalsSeriesResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.CalendarService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.UUID;

@Path("/api/babies/{babyId}")
@Authenticated
public class CalendarController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    CalendarService calendarService;

    @GET
    @Path("/events")
    @Produces(MediaType.APPLICATION_JSON)
    public List<CalendarEventResponse> events(@PathParam("babyId") UUID babyId,
                                              @QueryParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        return calendarService.eventsOfDay(currentUser.id, babyId, date);
    }

    @GET
    @Path("/daily-totals")
    @Produces(MediaType.APPLICATION_JSON)
    public DailyTotalsResponse dailyTotals(@PathParam("babyId") UUID babyId,
                                           @QueryParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        return calendarService.dailyTotals(currentUser.id, babyId, date);
    }

    @GET
    @Path("/totals-series")
    @Produces(MediaType.APPLICATION_JSON)
    public TotalsSeriesResponse totalsSeries(@PathParam("babyId") UUID babyId,
                                             @QueryParam("from") String from,
                                             @QueryParam("to") String to,
                                             @QueryParam("bucket") String bucket) {
        AppUser currentUser = currentUserResolver.require();
        return calendarService.totalsSeries(currentUser.id, babyId, from, to, bucket);
    }
}
