package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.EndNapRequest;
import com.suivibaby.model.NapPage;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.StartNapRequest;
import com.suivibaby.model.UpdateNapRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.NapService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * Siestes d'un bébé (US4.1/4.2/4.3), routes imbriquées sous {@code babyId}. Deux familles (D4-B) :
 * <ul>
 *   <li><strong>use-case</strong> (sieste courante, sans id) : {@code POST /start} (201),
 *       {@code POST /end} (200), {@code POST /reopen} (200) — transitions atomiques côté serveur ;</li>
 *   <li><strong>REST</strong> (donnée brute par id) : {@code GET} (liste keyset), {@code GET /current}
 *       (200/204), {@code PATCH /{id}} (200, valeurs only), {@code DELETE /{id}} (204).</li>
 * </ul>
 * Toute opération bornée par l'appartenance via le service : non liée / sieste d'un autre bébé → 404
 * (D4-G) ; pas de session → 401. Le {@code 409} (use-case) est affiché en info neutre côté front (D4-K).
 */
@Path("/api/babies/{babyId}/naps")
@Authenticated
public class NapController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    NapService napService;

    // --- use-case : sieste courante ---

    @POST
    @Path("/start")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response start(@PathParam("babyId") UUID babyId, StartNapRequest request) {
        AppUser currentUser = currentUserResolver.require();
        NapResponse created = napService.start(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @POST
    @Path("/end")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public NapResponse end(@PathParam("babyId") UUID babyId, EndNapRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return napService.end(currentUser.id, babyId, request);
    }

    @POST
    @Path("/reopen")
    @Produces(MediaType.APPLICATION_JSON)
    public NapResponse reopen(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        return napService.reopen(currentUser.id, babyId);
    }

    // --- REST : donnée brute par id ---

    @GET
    @Path("/current")
    @Produces(MediaType.APPLICATION_JSON)
    public Response current(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        NapResponse nap = napService.current(currentUser.id, babyId);
        return nap == null ? Response.noContent().build() : Response.ok(nap).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public NapPage list(@PathParam("babyId") UUID babyId,
                        @QueryParam("limit") @DefaultValue("20") int limit,
                        @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return napService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public NapResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                             UpdateNapRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return napService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        napService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
