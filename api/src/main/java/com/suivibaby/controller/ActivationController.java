package com.suivibaby.controller;

import com.suivibaby.model.ActivationRequest;
import com.suivibaby.service.ActivationService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Account activation via single-use link (US1.2). Public ({@code PermitAll}): the parent is not
 * authenticated yet.
 */
@Path("/api/activation")
@PermitAll
public class ActivationController {

    @Inject
    ActivationService activation;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response activate(@Valid ActivationRequest request) {
        activation.activate(request.token(), request.password());
        return Response.noContent().build(); // 204
    }

    /** Pre-validates the token before showing the form. 204 if usable, 410 otherwise. */
    @GET
    @Path("/{token}")
    public Response check(@PathParam("token") String token) {
        activation.checkUsable(token);
        return Response.noContent().build();
    }
}
