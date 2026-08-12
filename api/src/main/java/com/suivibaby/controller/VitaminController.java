package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.VitaminDayResponse;
import com.suivibaby.model.VitaminState;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.VitaminService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * Vitamines d'un bébé au niveau **jour** (US9.1). Toggle par présence de ligne (D9-A) :
 * {@code POST} coche (200 idempotent), {@code DELETE} décoche (204 systématique), {@code GET} lit
 * l'état du jour. Un seul check IDOR côté service (D9-C). {@code type} ∈ {d, k} sinon 400 (D9-D).
 */
@Path("/api/babies/{babyId}/vitamins")
@Authenticated
public class VitaminController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    VitaminService vitaminService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public VitaminDayResponse day(@PathParam("babyId") UUID babyId,
                                  @QueryParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        return vitaminService.day(currentUser.id, babyId, date);
    }

    @POST
    @Path("/{type}")
    @Produces(MediaType.APPLICATION_JSON)
    public VitaminState give(@PathParam("babyId") UUID babyId,
                             @PathParam("type") String type,
                             @QueryParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        return vitaminService.give(currentUser.id, babyId, type, date); // 200 idempotent (D9-B)
    }

    @DELETE
    @Path("/{type}")
    public Response unset(@PathParam("babyId") UUID babyId,
                          @PathParam("type") String type,
                          @QueryParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        vitaminService.unset(currentUser.id, babyId, type, date);
        return Response.noContent().build(); // 204 systématique (D9-B)
    }
}
