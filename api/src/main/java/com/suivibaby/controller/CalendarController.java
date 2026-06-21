package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.DailyTotalsResponse;
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

/**
 * Calendrier d'un bébé (Épic 6) — <strong>lecture seule</strong>, routes imbriquées sous {@code babyId}.
 * {@code GET /events} (US6.1) : liste chrono du jour, triée par heure. {@code GET /daily-totals} (US6.3) :
 * agrégats du jour. {@code date} (YYYY-MM-DD, Paris) optionnel → défaut aujourd'hui ; malformée → 400.
 * Appartenance bornée via le service : bébé non lié → <strong>404</strong> (D6-E) ; pas de session → 401 ;
 * journée vide (lié) → 200 (liste vide / totaux à 0).
 */
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
}
